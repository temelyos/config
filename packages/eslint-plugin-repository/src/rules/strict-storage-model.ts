import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

import { isStoredRow } from '../storage-shapes.js';
import { calledMember, isZodNamespaceCall } from '../zod-shape.js';

export type MessageIds = 'looseStorageModel';

export type Options = [{ shapes?: string[] }?];

/**
 * Flags the base model of a stored row declared with the loose `z.object` factory
 * (repository rule 12).
 *
 * `<Model>` is what a stored row holds and it stays strict, so a key the model does not
 * declare is a parse error rather than a value that disappears. Under `z.object` it
 * disappears: a caller that misspells a field, or sends one the model dropped two
 * releases ago, is answered with a successful write that stored neither.
 *
 * A row is recognised by the repositories, not by a name or a directory: every `schema:`
 * a repository declares is one, and so is the base such a model is built from — which is
 * how a loose `z.object` hiding behind an exported `.extend` gets caught. `baseVoiceCall`
 * was exactly that, and it was the one loose base with real exposure.
 *
 * Only the row's own base is flagged, not the value objects it nests. A nested shape can
 * need its own write form before it can be strict — where the same element is also an AI
 * turn's response, the shape has to be split first — and that is design work rather than
 * a flip.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context, [options]) {
		return {
			VariableDeclarator(node) {
				if (node.id.type !== 'Identifier' || node.init?.type !== 'CallExpression') {
					return;
				}

				const init: TSESTree.CallExpression = node.init;

				// `z.object` specifically: a bare member name also matches `lodash.object`.
				if (calledMember(init) !== 'object' || !isZodNamespaceCall(init)) {
					return;
				}

				if (!isStoredRow(node.id.name, context.cwd, options?.shapes)) {
					return;
				}

				context.report({ data: { name: node.id.name }, messageId: 'looseStorageModel', node: init.callee });
			}
		};
	},
	defaultOptions: [{}],
	meta: {
		docs: {
			description:
				'Require the base model of a stored row to use z.strictObject, so an undeclared key is refused rather than silently stripped.'
		},
		messages: {
			looseStorageModel:
				'{{name}} is the base of a row a repository stores, so it stays strict: use z.strictObject, and an undeclared key is refused instead of silently stripped (repository rule 12). Check what parses it before converting — z.object strips an unknown key where a strict object throws on it — and where a stored row really does carry a key the model omits, declare the key rather than leaving the model loose.'
		},
		schema: [{
			additionalProperties: false,
			properties: { shapes: { items: { type: 'string' }, type: 'array' } },
			type: 'object'
		}],
		type: 'problem'
	}
});
