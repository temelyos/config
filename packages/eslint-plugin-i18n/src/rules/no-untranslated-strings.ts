import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'untranslated';

export type Options = [
	{
		/** Additional strings to ignore (exact match, trimmed). */
		allow?: string[],
		/** JSX attribute names whose string values should be checked. Replaces the default set when provided. */
		attributes?: string[]
	}?
];

const DEFAULT_ATTRIBUTES = [
	'label',
	'placeholder',
	'title',
	'description',
	'aria-label',
	'alt',
	'tooltip',
	'heading',
	'subheading',
	'emptyMessage',
	'confirmLabel',
	'cancelLabel'
];

/** Built-in allow list — short strings that are almost never translated. */
const BUILTIN_ALLOW = ['OK', 'ID'];

function attributeName(node: TSESTree.JSXAttribute): string {
	if (node.name.type === 'JSXIdentifier') {
		return node.name.name;
	}

	// The only other JSXAttribute name variant is JSXNamespacedName (e.g. xml:lang).
	return `${node.name.namespace.name}:${node.name.name.name}`;
}

/**
 * Returns true when the string contains at least two ASCII letters with anything
 * between them, i.e. it reads like a real word rather than punctuation, whitespace,
 * or a single glyph.
 */
function hasAtLeastTwoLetters(value: string): boolean {
	return /[a-zA-Z].*[a-zA-Z]/u.test(value.replace(/\s/g, ' '));
}

/**
 * Returns true when the node sits inside a `t(…)` call expression. The walk stops
 * at JSX element boundaries so a higher-level t() can't mask this specific node.
 */
function isInsideTCall(node: TSESTree.Node): boolean {
	let current: TSESTree.Node | undefined = node.parent;

	while (current) {
		if (
			current.type === 'CallExpression'
			&& current.callee.type === 'Identifier'
			&& current.callee.name === 't'
		) {
			return true;
		}

		if (current.type === 'JSXElement' || current.type === 'JSXFragment') {
			break;
		}

		current = current.parent;
	}

	return false;
}

export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context, [options]) {
		const flaggedAttributes = options?.attributes ?? DEFAULT_ATTRIBUTES;
		const allowSet = new Set([...(options?.allow ?? []), ...BUILTIN_ALLOW]);

		function shouldFlag(rawText: string): boolean {
			const text = rawText.trim();

			if (!text || allowSet.has(text)) {
				return false;
			}

			return hasAtLeastTwoLetters(text);
		}

		return {
			JSXAttribute(node) {
				const name = attributeName(node);

				// data-* attributes are never flagged regardless of the configured set.
				if (!name || name.startsWith('data-') || !flaggedAttributes.includes(name)) {
					return;
				}

				const value = node.value;

				if (!value || value.type !== 'Literal' || typeof value.value !== 'string') {
					return;
				}

				if (!shouldFlag(value.value) || isInsideTCall(value)) {
					return;
				}

				context.report({
					data: { text: value.value.trim() },
					messageId: 'untranslated',
					node: value
				});
			},

			JSXText(node) {
				if (!shouldFlag(node.value)) {
					return;
				}

				context.report({
					data: { text: node.value.trim() },
					messageId: 'untranslated',
					node
				});
			}
		};
	},
	defaultOptions: [{}],
	meta: {
		docs: {
			description:
				'Disallow user-facing string literals in JSX that are not wrapped in t() for translation.'
		},
		messages: {
			untranslated:
				'User-facing string "{{text}}" should be wrapped in t() for translation.'
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					allow: {
						description: 'Additional strings to ignore (exact match, trimmed).',
						items: { type: 'string' },
						type: 'array'
					},
					attributes: {
						description:
							'JSX attribute names whose string values should be checked. Replaces the default set when provided.',
						items: { type: 'string' },
						type: 'array'
					}
				},
				type: 'object'
			}
		],
		type: 'suggestion'
	}
});
