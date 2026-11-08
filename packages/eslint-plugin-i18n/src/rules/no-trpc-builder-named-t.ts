import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'builderNamedT';

export type Options = [];

/**
 * Returns the leftmost identifier name of a call/member chain
 * (e.g. `initTRPC.context().meta().create()` → `initTRPC`, `tRpc` → `tRpc`).
 */
function leftmostIdentifierName(node: TSESTree.Node): string | undefined {
	let current: TSESTree.Node = node;

	for (;;) {
		if (current.type === 'CallExpression') {
			current = current.callee;
		} else if (current.type === 'MemberExpression') {
			current = current.object;
		} else if (current.type === 'Identifier') {
			return current.name;
		} else {
			return undefined;
		}
	}
}

/**
 * Forbids binding the tRPC builder to the name `t`. `t` is reserved for the i18n
 * translation marker (`t('Key', 'English')`); the builder must be named `trpc`.
 * Fires on `const t = tRpc` and `const/export const t = initTRPC….create()`.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		return {
			VariableDeclarator(node) {
				if (node.id.type !== 'Identifier' || node.id.name !== 't' || !node.init) {
					return;
				}

				const root = leftmostIdentifierName(node.init);

				if (root === 'tRpc' || root === 'initTRPC') {
					context.report({ messageId: 'builderNamedT', node });
				}
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description:
				'Forbid binding the tRPC builder to the name `t`, which is reserved for the i18n translation marker; use `trpc`.'
		},
		messages: {
			builderNamedT:
				"Bind the tRPC builder to `trpc`, not `t` — the name `t` is reserved for the i18n translation marker t('Key', 'English')."
		},
		schema: [],
		type: 'problem'
	}
});
