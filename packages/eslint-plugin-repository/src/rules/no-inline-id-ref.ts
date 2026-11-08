import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

import { isStorageShape } from '../storage-shapes.js';
import { declaredNames, isZodObjectCall, outermostDeclaratorName, writeModelBase } from '../zod-shape.js';

export type MessageIds = 'inlineIdRef';

export type Options = [{ shapes?: string[] }?];

/** True when the shape declares an `_id` key — what makes it an id partial. */
function declaresId(shape: TSESTree.ObjectExpression): boolean {
	return shape.properties.some(
		property =>
			property.type === 'Property'
			&& !property.computed
			&& ((property.key.type === 'Identifier' && property.key.name === '_id')
				|| (property.key.type === 'Literal' && property.key.value === '_id'))
	);
}

/**
 * True when the call is what a `const` is initialised to, however much is chained onto
 * it: `const idRef = z.object({ _id }).optional()` is the helper the rule exists to push
 * sites towards, not a site.
 */
function isDeclaratorInitializer(node: TSESTree.CallExpression): boolean {
	let current: TSESTree.Node = node;
	let parent: TSESTree.Node | undefined = node.parent;

	while (parent) {
		if (parent.type === 'VariableDeclarator') {
			return parent.init === current;
		}

		const isChainedOn =
			(parent.type === 'MemberExpression' && parent.object === current)
			|| (parent.type === 'CallExpression' && parent.callee === current);

		if (!isChainedOn) {
			return false;
		}

		current = parent;
		parent = parent.parent;
	}

	return false;
}

/** The shape literal a zod object call was given, when it was given one. */
function shapeOf(node: TSESTree.CallExpression): TSESTree.ObjectExpression | undefined {
	const [first] = node.arguments;

	return first?.type === 'ObjectExpression' ? first : undefined;
}

/**
 * Flags an inline `z.object({ _id })` partial declaring a join on a shape a repository
 * stores (repository rule 1).
 *
 * A read model declares a join as the joined model, with a `Basic*` type where that is
 * all the join needs. An inline partial pins the join to the fields whoever wrote it
 * needed that day: the next reader who wants a fourth widens the model instead of asking
 * for a select, and nothing ties the partial to the model it stands for, so a field
 * renamed on the joined model is renamed nowhere here.
 *
 * Rule 2's shape is correct and is not flagged: an `Add`/`Update` model takes a join as a
 * ref under the same key. A write model is recognised by the base it is named for being
 * declared in the same file, not by its prefix — matching `Add` alone would exempt
 * `AddressBook`, and `Update` alone would exempt `UpdatedByInfo`. Nor is the ref helper
 * itself flagged, since that is the form the rule points sites towards.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context, [options]) {
		let declared: ReadonlySet<string> = new Set();

		return {
			CallExpression(node) {
				if (!isZodObjectCall(node)) {
					return;
				}

				const shape = shapeOf(node);

				if (!shape || !declaresId(shape) || isDeclaratorInitializer(node)) {
					return;
				}

				const declaredAs = outermostDeclaratorName(node);

				// Rule 2: a write model takes its joins as refs under the same key.
				if (writeModelBase(declaredAs, declared) !== undefined) {
					return;
				}

				if (!isStorageShape(declaredAs, context.cwd, options?.shapes)) {
					return;
				}

				context.report({ data: { name: declaredAs ?? 'this shape' }, messageId: 'inlineIdRef', node });
			},
			Program(program) {
				declared = declaredNames(program);
			}
		};
	},
	defaultOptions: [{}],
	meta: {
		docs: {
			description:
				'Disallow an inline z.object({ _id }) partial for a join on a stored shape, which has to be declared as the joined model instead.'
		},
		messages: {
			inlineIdRef:
				'{{name}} is stored by a repository, and a stored shape declares a join as the joined model, with a Basic* type where that is all the join needs, never as an inline z.object({ _id }) partial (repository rule 1). An Add/Update model taking the join as a ref is rule 2\'s shape and belongs behind the file\'s idRef helper. Where the key is a denormalized snapshot rather than a join, disable this rule on the line and say so.'
		},
		schema: [{
			additionalProperties: false,
			properties: { shapes: { items: { type: 'string' }, type: 'array' } },
			type: 'object'
		}],
		type: 'problem'
	}
});
