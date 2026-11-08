import type { TSESTree } from '@typescript-eslint/utils';

/** The zod combinators that take a shape literal, or carry one over from a base. */
const shapeCalls = new Set([
	'and',
	'discriminatedUnion',
	'extend',
	'looseObject',
	'merge',
	'object',
	'omit',
	'partial',
	'pick',
	'strictObject',
	'union'
]);

/** The zod object factories, as opposed to a combinator over an existing shape. */
const objectFactories = new Set(['looseObject', 'object', 'strictObject']);

/** The name a member call invokes, or undefined when it is not a plain member call. */
export function calledMember(node: TSESTree.CallExpression): string | undefined {
	const { callee } = node;

	return callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier'
		? callee.property.name
		: undefined;
}

/** Every top-level `const` name the file declares, exported or not. */
export function declaredNames(program: TSESTree.Program): ReadonlySet<string> {
	const names = new Set<string>();

	for (const statement of program.body) {
		const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

		if (declaration?.type !== 'VariableDeclaration') {
			continue;
		}

		for (const declarator of declaration.declarations) {
			if (declarator.id.type === 'Identifier') {
				names.add(declarator.id.name);
			}
		}
	}

	return names;
}

/**
 * True when `node` sits inside a zod shape — the literal handed to an object factory, or
 * one carried over by `.extend`/`.partial`/`.omit` and friends.
 *
 * This is what separates a zod modifier from a same-named method on an unrelated object:
 * `.default()` counts only where a shape is being built, so a `settings.default(1)` in
 * ordinary code is never a report.
 */
export function isInsideZodShape(node: TSESTree.Node): boolean {
	let current: TSESTree.Node | undefined = node.parent;

	while (current) {
		if (current.type === 'CallExpression') {
			const member = calledMember(current);

			if (member !== undefined && shapeCalls.has(member)) {
				return true;
			}
		}

		current = current.parent;
	}

	return false;
}

/**
 * True when the member call's receiver is the `z` namespace itself.
 *
 * Without this a rule matching a bare member name flags anything that happens to share it
 * — `lodash.object(…)` for a factory, `settings.default(1)` for a modifier — and since
 * these rules are errors, that is a third party's build broken by a name collision.
 */
export function isZodNamespaceCall(node: TSESTree.CallExpression): boolean {
	const { callee } = node;

	return callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'z';
}

/** True when `node` is `z.object(...)`, `z.strictObject(...)` or `z.looseObject(...)`. */
export function isZodObjectCall(node: TSESTree.CallExpression): boolean {
	const member = calledMember(node);

	return member !== undefined && objectFactories.has(member);
}

/** The outermost `const` a node sits in — the schema being declared, whatever the nesting. */
export function outermostDeclaratorName(node: TSESTree.Node): string | undefined {
	let current: TSESTree.Node | undefined = node;
	let name: string | undefined;

	while (current) {
		if (current.type === 'VariableDeclarator' && current.id.type === 'Identifier') {
			name = current.id.name;
		}

		current = current.parent;
	}

	return name;
}

/**
 * The base model an `Add`/`Update` write model is named for, when the file declares one.
 *
 * Matching the prefix alone lets `AddressBook` and `UpdatedByInfo` pass as write models,
 * so the remainder has to name a real declaration: `AddUserSession` is a write model
 * because `UserSession` is here, and `AddressBook` is not because `ressBook` is nothing.
 */
export function writeModelBase(name: string | undefined, declared: ReadonlySet<string>): string | undefined {
	if (name === undefined) {
		return undefined;
	}

	for (const prefix of ['Add', 'Update', 'Insert']) {
		if (!name.startsWith(prefix)) {
			continue;
		}

		const base = name.slice(prefix.length);

		if (base.length > 0 && declared.has(base)) {
			return base;
		}
	}

	return undefined;
}
