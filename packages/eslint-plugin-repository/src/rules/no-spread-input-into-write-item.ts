import { ASTUtils, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'spreadInputIntoItem';

export type Options = [];

/** The handler's own binding for the request body, by the name every router gives it. */
const INPUT_NAME = 'input';

/** True when the property names the write item. */
function isItemProperty(property: TSESTree.Property): boolean {
	const { key } = property;

	if (key.type === 'Identifier') {
		return key.name === 'item';
	}

	return key.type === 'Literal' && key.value === 'item';
}

/** The nearest property this object literal is the value of, ignoring casts. */
function owningProperty(object: TSESTree.ObjectExpression): TSESTree.Property | undefined {
	let current: TSESTree.Node = object;

	while (current.parent.type === 'TSAsExpression' || current.parent.type === 'TSSatisfiesExpression') {
		current = current.parent;
	}

	const { parent } = current;

	return parent.type === 'Property' && parent.value === current && !parent.computed ? parent : undefined;
}

/** The identifier the spread copies wholesale, or `undefined` for anything else. */
function spreadRoot(spread: TSESTree.SpreadElement): TSESTree.Identifier | undefined {
	const { argument } = spread;

	if (argument.type === 'Identifier') {
		return argument;
	}

	// `...input.item`, the nested request shape. A deeper path names a piece of the
	// request somebody already picked out, not the request.
	return (
		argument.type === 'MemberExpression'
		&& !argument.computed
		&& argument.object.type === 'Identifier'
	)
		? argument.object
		: undefined;
}

/**
 * Flags a write item built by spreading the whole request input (API rule 6).
 *
 * A request takes its joins as id strings, and every one of them has to be found with
 * `resolveReferences` under the caller's context before it is written (API rule 2).
 * Spreading the input puts all of them in at once, so the ones the handler forgot are
 * written as the client sent them — and the spread is what hides which ones those are.
 * Name the joins in a destructure, resolve each, and spread the remainder:
 *
 *     const { owner, ...rest } = input;
 *     const ownerRow = await users.resolveReferences({ context, field: 'owner', ids: owner });
 *     await repo.insert({ context, item: { ...rest, owner: ownerRow } });
 *
 * The remainder is a different binding, so that shape does not fire. A request that
 * carries no joins at all has nothing to destructure; disable the rule on the line and
 * say so, so the next join added to it is a decision somebody makes.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		/**
		 * True when the identifier is the handler's request rather than a rest of it.
		 * The request is a key somebody picked out of what the handler was handed —
		 * `({ ctx, input }) => …` — and a rest binding, `const { owner, ...rest } =
		 * input`, is by definition not a key. The name alone cannot tell them apart, so
		 * the binding is what decides it.
		 */
		const isRequestBinding = (identifier: TSESTree.Identifier): boolean => {
			if (identifier.name !== INPUT_NAME) {
				return false;
			}

			const variable = ASTUtils.findVariable(context.sourceCode.getScope(identifier), INPUT_NAME);

			return (
				variable !== null
				&& variable.defs.length > 0
				&& variable.defs.every(def => def.name.parent.type === 'Property')
			);
		};

		return {
			ObjectExpression(node) {
				const property = owningProperty(node);

				if (!property || !isItemProperty(property)) {
					return;
				}

				for (const spread of node.properties) {
					if (spread.type !== 'SpreadElement') {
						continue;
					}

					const root = spreadRoot(spread);

					if (root && isRequestBinding(root)) {
						context.report({ messageId: 'spreadInputIntoItem', node: spread });
					}
				}
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description:
				'Disallow building a write item by spreading a handler request wholesale, which writes every client-sent join id unproved.'
		},
		messages: {
			spreadInputIntoItem:
				'Spreading the request into the item writes every client-sent id as it arrived. Destructure the joins out of the input, find each with resolveReferences under the caller\'s context, and spread the remainder. Where the request carries no joins, disable this rule on the line and say so.'
		},
		schema: [],
		type: 'problem'
	}
});
