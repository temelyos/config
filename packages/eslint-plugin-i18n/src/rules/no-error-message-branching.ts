import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'branchOnMessage';

export type Options = [];

const comparisons = new Set(['!=', '!==', '==', '===']);
const stringTests = new Set(['endsWith', 'includes', 'startsWith']);

/** `Errors.Error_X` (any `*Errors` registry) or an `'Error_…'` literal — an error key. */
function isErrorKey(node: TSESTree.Node): boolean {
	if (node.type === 'MemberExpression') return node.object.type === 'Identifier' && /Errors$/u.test(node.object.name);

	return node.type === 'Literal' && typeof node.value === 'string' && node.value.startsWith('Error_');
}

/** `err.message`, or `errorToString(err)` — an error's text, which a translating server makes display text. */
function isErrorText(node: TSESTree.Node): boolean {
	if (node.type === 'MemberExpression') {
		return !node.computed && node.property.type === 'Identifier' && node.property.name === 'message';
	}

	return node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'errorToString';
}

/**
 * Flags a decision made from an error's text: `err.message === Errors.X`,
 * `err.message.includes('Error_X')`, `switch (err.message) { case Errors.X: }`, and the same
 * on `errorToString(err)`. A server that translates its errors sends display text in
 * `message`, so the comparison silently stops matching. Branch on the key instead:
 * `errorKeyOf(err)` (or a `ServerError`'s `name`).
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		return {
			BinaryExpression(node) {
				if (!comparisons.has(node.operator) || node.left.type === 'PrivateIdentifier') return;

				if ((isErrorText(node.left) && isErrorKey(node.right)) || (isErrorKey(node.left) && isErrorText(node.right))) {
					context.report({ messageId: 'branchOnMessage', node });
				}
			},
			CallExpression(node) {
				const { callee } = node;
				const [arg] = node.arguments;

				if (
					callee.type === 'MemberExpression'
					&& !callee.computed
					&& callee.property.type === 'Identifier'
					&& stringTests.has(callee.property.name)
					&& isErrorText(callee.object)
					&& arg
					&& isErrorKey(arg)
				) {
					context.report({ messageId: 'branchOnMessage', node });
				}
			},
			SwitchStatement(node) {
				if (isErrorText(node.discriminant) && node.cases.some(c => c.test && isErrorKey(c.test))) {
					context.report({ messageId: 'branchOnMessage', node: node.discriminant });
				}
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description: 'Disallow deciding something from an error\'s message text; branch on its key with errorKeyOf(err).'
		},
		messages: {
			branchOnMessage:
				'An error\'s message can be display text in the reader\'s language, so this comparison stops matching once the server translates. Branch on the key: errorKeyOf(err) === Errors.X (a ServerError\'s key is its `name`).'
		},
		schema: [],
		type: 'problem'
	}
});
