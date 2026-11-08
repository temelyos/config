import { ESLintUtils } from '@typescript-eslint/utils';

import { isStorageShape } from '../storage-shapes.js';
import { calledMember, isInsideZodShape, outermostDeclaratorName } from '../zod-shape.js';

export type MessageIds = 'modelDefault';

export type Options = [{ shapes?: string[] }?];

/**
 * Flags a zod `.default()` on a shape a repository stores (repository rule 6).
 *
 * A repository write never parses the model, so the default does not run on an insert
 * that comes from a seed, a job or another module — only on the one request that happens
 * to parse the schema. The row then lands without the value, and which callers got it
 * depends on which of them went through a parse. The default belongs in the repository's
 * `processInsertItem`, where every caller of `insert` gets it; the storage model requires
 * the value and the `Add`/`Update` model makes it optional.
 *
 * Which shapes those are comes from the repositories themselves rather than from a
 * `models/` glob. That glob was wrong in both directions: it flagged a form validator and
 * a plugin `settingsSchema`, which store nothing, and it missed the row models in
 * `multi-factor/`, which is not a `models/` directory. Every suppression this rule used to
 * need said "this is not actually a model", which is the sign of a rule pointed at the
 * wrong set.
 *
 * A `*Request` declaration is still exempt, because rule 6 puts request-specific concerns
 * on the request and a read request's paging default stores nothing.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context, [options]) {
		return {
			CallExpression(node) {
				if (calledMember(node) !== 'default' || !isInsideZodShape(node)) {
					return;
				}

				const declaredAs = outermostDeclaratorName(node);

				if (declaredAs?.endsWith('Request') || !isStorageShape(declaredAs, context.cwd, options?.shapes)) {
					return;
				}

				context.report({ data: { name: declaredAs ?? 'this shape' }, messageId: 'modelDefault', node: node.callee });
			}
		};
	},
	defaultOptions: [{}],
	meta: {
		docs: {
			description:
				'Disallow a zod .default() on a shape a repository stores, which a repository write never parses, so the insert default has to live in processInsertItem.'
		},
		messages: {
			modelDefault:
				'{{name}} is stored by a repository, and a repository write never parses it, so this default does not run on an insert. Move it to the repository\'s processInsertItem, require the value on the storage model and make it optional on the Add/Update model (repository rule 6). Where the shape is also parsed on a path that stores nothing, disable this rule on the line and name that parse site.'
		},
		schema: [{
			additionalProperties: false,
			properties: { shapes: { items: { type: 'string' }, type: 'array' } },
			type: 'object'
		}],
		type: 'problem'
	}
});
