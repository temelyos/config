import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'implicitLocale';

export type Options = [];

const localeMethods = /^toLocale(Date|Time)?String$/;
const intlFormatters = new Set(['DateTimeFormat', 'DisplayNames', 'DurationFormat', 'ListFormat', 'NumberFormat', 'PluralRules', 'RelativeTimeFormat']);

function passesNoLocale([first]: TSESTree.CallExpressionArgument[]) {
	return !first
		|| (first.type === 'Identifier' && first.name === 'undefined')
		|| (first.type === 'ArrayExpression' && first.elements.length === 0);
}

/**
 * Flags `date.toLocaleString()`, `new Intl.NumberFormat()` and the other locale-sensitive
 * formatters called with no locale (or `undefined`, or `[]`): they format in the machine's
 * locale, not the account's.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		function check(node: TSESTree.CallExpression | TSESTree.NewExpression) {
			const callee = node.callee;

			if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return;

			const isLocaleMethod = node.type === 'CallExpression' && localeMethods.test(callee.property.name);
			const isIntlFormatter = callee.object.type === 'Identifier' && callee.object.name === 'Intl' && intlFormatters.has(callee.property.name);

			if ((isLocaleMethod || isIntlFormatter) && passesNoLocale(node.arguments)) {
				context.report({ messageId: 'implicitLocale', node });
			}
		}

		return {
			CallExpression: check,
			NewExpression: check
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description: 'Require an explicit locale for locale-sensitive formatting, which otherwise uses the machine\'s.'
		},
		messages: {
			implicitLocale: 'Pass the account locale (useLocale()), or this formats in the machine\'s.'
		},
		schema: [],
		type: 'problem'
	}
});
