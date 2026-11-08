import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'conditionalItemKey';

export type Options = [];

/** The keys whose value the repository cleans before writing it, so rule 5 holds inside them. */
const writeItemKeys = new Set(['$set', '$setOnInsert', 'item']);

/**
 * The keys whose value is read rather than written. A `where` key set to `undefined`
 * filters for undefined instead of matching everything, an empty `$inc` is invalid to
 * Mongo, and a `$push` entry or a `$unset` path is written exactly as given — so a
 * conditional key is the correct shape under all of them.
 */
const optionKeys = new Set(['select', 'update', 'where']);

/** The hooks whose returned object is the item the write goes on with. */
const writeItemHooks = new Set(['buildUpdate', 'processInsertItem', 'processUpdateItem']);

/** The write methods, on both the repository API and the generated client. */
const writeMethods = new Set(['insert', 'insertMany', 'update', 'updateById', 'updateMany', 'updateOne']);

/** True when the object literal contributes at least one key. */
function addsAKey(node: TSESTree.Node): boolean {
	return node.type === 'ObjectExpression' && node.properties.length > 0;
}

/** The name a function is declared under — its own, or the one it is assigned to. */
function declaredName(fn: TSESTree.Node): string | undefined {
	if (fn.type === 'FunctionDeclaration') {
		return fn.id?.name;
	}

	const owner = fn.parent;

	if (!owner) {
		return undefined;
	}

	if (owner.type === 'MethodDefinition' || owner.type === 'Property' || owner.type === 'PropertyDefinition') {
		return owner.value === fn ? staticKeyName(owner) : undefined;
	}

	return owner.type === 'VariableDeclarator' && owner.id.type === 'Identifier' ? owner.id.name : undefined;
}

/** True when `object` declares `name` outright, rather than through a spread. */
function hasOwnKey(object: TSESTree.ObjectExpression, name: string): boolean {
	return object.properties.some(property => property.type === 'Property' && staticKeyName(property) === name);
}

/**
 * True when `object` is the item a call is being handed, rather than the repository's
 * options. `repo.insert({ context, item, select })` carries the item under `item:`;
 * `Invoices.insert({ ...fields })` IS the item, and so is the object passed on to a hook
 * — `super.processInsertItem({ ...item, extra })` writes what it is given. A `context:` or
 * `where:` key tells an options object from an item.
 */
function isCallWriteItem(call: TSESTree.CallExpression, argument: TSESTree.Node): boolean {
	const { callee } = call;

	if (
		call.arguments[0] !== argument
		|| callee.type !== 'MemberExpression'
		|| callee.computed
		|| callee.property.type !== 'Identifier'
		|| !(writeMethods.has(callee.property.name) || writeItemHooks.has(callee.property.name))
	) {
		return false;
	}

	const item = withoutCasts(argument);

	return (
		item.type === 'ObjectExpression'
		&& !hasOwnKey(item, 'context')
		&& !hasOwnKey(item, 'where')
	);
}

/**
 * True when the spread adds its keys only on a condition: `...(cond && { x })`, or a
 * ternary with an object literal on either side. A spread of a whole value — `...item`,
 * `...(overrides ?? fallback)` — merges an object somebody else built and says nothing
 * about which keys it holds.
 */
function isConditionalKeySpread(spread: TSESTree.SpreadElement): boolean {
	const { argument } = spread;

	if (argument.type === 'LogicalExpression') {
		return argument.operator === '&&' && addsAKey(argument.right);
	}

	return (
		argument.type === 'ConditionalExpression'
		&& (addsAKey(argument.consequent) || addsAKey(argument.alternate))
	);
}

/** True when `node` is a function of any kind — the boundary the ancestor walk stops at. */
function isFunctionNode(node: TSESTree.Node): boolean {
	return (
		node.type === 'ArrowFunctionExpression'
		|| node.type === 'FunctionDeclaration'
		|| node.type === 'FunctionExpression'
	);
}

/**
 * True when the repository will clean `object` before it is written, judged from what
 * encloses it. The nearest enclosing answer wins: the `$set` of an `update:` is an item
 * even though `update:` itself is not, and an array element inside an `item:` is not one
 * even though the item is.
 */
function isWriteItem(object: TSESTree.ObjectExpression): boolean {
	let current: TSESTree.Node = object;
	let parent: TSESTree.Node | undefined = object.parent;

	while (parent) {
		// An array element is written as given: the repository cleans plain objects only.
		if (parent.type === 'ArrayExpression') {
			return false;
		}

		if (parent.type === 'Property' && parent.value === current) {
			const name = staticKeyName(parent);

			if (name !== undefined && writeItemKeys.has(name)) {
				return true;
			}

			// A computed key is one we can't read; the rest name a clause, not an item.
			if (name === undefined || optionKeys.has(name) || name.startsWith('$')) {
				return false;
			}
		}

		if (parent.type === 'CallExpression' && parent.arguments.includes(current as TSESTree.CallExpressionArgument)) {
			return isCallWriteItem(parent, current);
		}

		// An object built inside a function belongs to whoever calls that function, which
		// we can't see — except for the hooks, whose result the repository writes.
		if (isFunctionNode(parent)) {
			const name = declaredName(parent);

			return name !== undefined && writeItemHooks.has(name);
		}

		current = parent;
		parent = current.parent;
	}

	return false;
}

/** The static name of a property, or `undefined` for a computed one we can't read. */
function staticKeyName(node: TSESTree.MethodDefinition | TSESTree.Property | TSESTree.PropertyDefinition): string | undefined {
	if (node.computed) {
		return undefined;
	}

	const { key } = node;

	if (key.type === 'Identifier') {
		return key.name;
	}

	return key.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined;
}

/** The expression itself, past any cast written around it. */
function withoutCasts(node: TSESTree.Node): TSESTree.Node {
	let current = node;

	while (
		current.type === 'TSAsExpression'
		|| current.type === 'TSNonNullExpression'
		|| current.type === 'TSSatisfiesExpression'
	) {
		current = current.expression;
	}

	return current;
}

/**
 * Flags a key added to a repository write item on a condition (repository rule 5).
 *
 * The repository drops `undefined` keys, joins included, from an insert or update item
 * and from `$set`, so a value that may be `undefined` is spread as it is — the guard
 * buys nothing and hides what the write covers. Worse, it reads as though sending
 * `undefined` were dangerous, which is how a field ends up impossible to clear:
 * `undefined` means "leave it alone", and the guard is what makes that the only thing it
 * can mean. Write `x: cond ? v : undefined`.
 *
 * What counts as an item is decided by what encloses the object, not by the call: the
 * same options object carries `where:`, `update:` and `select:`, where a conditional key
 * is the correct shape. The `item:`/`$set:` anchor reads the key and not the receiver, so
 * an aggregation's `$set` stage would be flagged too — there `undefined` is a value, and
 * the site wants a disable comment. An array element and a `$push`/`$addToSet`/`$pull` entry are
 * written verbatim, so they are out of scope too. An object whose keys something reads
 * with `Object.keys` or `in` before the write cannot be told apart syntactically and
 * needs the ordinary disable comment.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		return {
			ObjectExpression(node) {
				const guarded = node.properties.filter(
					(property): property is TSESTree.SpreadElement =>
						property.type === 'SpreadElement' && isConditionalKeySpread(property)
				);

				if (guarded.length === 0 || !isWriteItem(node)) {
					return;
				}

				for (const spread of guarded) {
					context.report({ messageId: 'conditionalItemKey', node: spread });
				}
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description:
				'Disallow adding a key to a repository write item on a condition, which the repository already does by dropping undefined.'
		},
		messages: {
			conditionalItemKey:
				'A write item drops its undefined keys, so spread the value as it is: write `x: cond ? v : undefined` instead of adding the key on a condition. Where something reads this object\'s keys before the write, disable this rule on the line and say why.'
		},
		schema: [],
		type: 'problem'
	}
});
