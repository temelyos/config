import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'missingStatus';

export type Options = [];

/**
 * True when `node` references a member of an error-key registry — a `defineErrors`
 * object conventionally named `*Errors` (e.g. `Errors.Error_X`,
 * `FrameworkErrors.Error_Y`, `Errors['mongo:z']`). These members resolve to
 * translation-key strings at runtime, which is exactly what makes the single-arg
 * `ServerError` overload misfire.
 */
function isErrorKeyReference(node: TSESTree.Node): boolean {
	return (
		node.type === 'MemberExpression'
		&& node.object.type === 'Identifier'
		&& /Errors$/u.test(node.object.name)
	);
}

/**
 * Flags `new ServerError(SomeErrors.Error_X, ...)` — a translation key in the
 * first-argument slot. The `ServerError` constructor treats a leading string as
 * the `message` (with any second argument becoming `name`), so the intended key
 * never reaches the client as a localizable `name`. Callers must pass an HTTP
 * status first: `new ServerError(404, Errors.Error_NotFound)`.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		return {
			NewExpression(node) {
				if (node.callee.type !== 'Identifier' || node.callee.name !== 'ServerError') {
					return;
				}

				// A translation key in the FIRST slot is broken at any arity: the
				// string-first overload coerces it to `message` (and a second arg
				// would land in `name`), so the key never localizes.
				const arg = node.arguments[0];

				if (!arg || !isErrorKeyReference(arg)) {
					return;
				}

				context.report({ messageId: 'missingStatus', node });
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description:
				'Require an HTTP status as the first argument when constructing a ServerError from a translation key, so the key lands in `name` and the error localizes.'
		},
		messages: {
			missingStatus:
				'new ServerError(<key>) passes the translation key as the message; name defaults to Error_InternalServer and the error will not localize. Pass an HTTP status first, e.g. new ServerError(404, Errors.Error_NotFound).'
		},
		schema: [],
		type: 'problem'
	}
});
