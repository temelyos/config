import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'literalText';

export type Options = [];

/** The message center's and `AppMessaging`'s entry points that take `{ text }`. */
const logMethods = new Set(['error', 'info', 'log', 'warn']);

/** Words written in the source: a string literal, or a template with any text of its own. */
function isWrittenString(node: TSESTree.Node): boolean {
	if (node.type === 'Literal') return typeof node.value === 'string';

	return node.type === 'TemplateLiteral' && node.quasis.some(quasi => quasi.value.raw.trim() !== '');
}

/**
 * Flags `{ text: 'Saved.' }` handed to `AppMessaging.log` or a message center's
 * `info` / `warn` / `error`. `text` is shown as it is — it is for sentences a server already
 * translated — so a literal there is English every reader sees. Log a key instead:
 * `{ key: 'Saved', fallback: 'Saved.' }`.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		return {
			CallExpression(node) {
				const { callee } = node;

				if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier' || !logMethods.has(callee.property.name)) return;

				for (const arg of node.arguments) {
					if (arg.type !== 'ObjectExpression') continue;

					for (const property of arg.properties) {
						if (
							property.type === 'Property'
							&& !property.computed
							&& property.key.type === 'Identifier'
							&& property.key.name === 'text'
							&& isWrittenString(property.value)
						) {
							context.report({ messageId: 'literalText', node: property.value });
						}
					}
				}
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description: 'Disallow a string literal as logged `text`, which is shown untranslated; log a `key` with its `fallback`.'
		},
		messages: {
			literalText:
				'`text` is shown as it is, so a literal here is English for every reader. Log `{ key, fallback }` instead; `text` is for a sentence a server already translated.'
		},
		schema: [],
		type: 'problem'
	}
});
