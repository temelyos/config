import { ASTUtils, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'translatedMessage';

export type Options = [];

/** How the codebase names its errors: `Error`, `TRPCClientError`, `ApiError`, `ServerError`. */
const errorName = /Error$/;

function isErrorTypeNode(node: TSESTree.TypeNode | undefined): boolean {
	if (node?.type === 'TSUnionType') return node.types.some(isErrorTypeNode);

	return node?.type === 'TSTypeReference' && node.typeName.type === 'Identifier' && errorName.test(node.typeName.name);
}

/** Whether `test` narrows `name` to an error with `instanceof`, alone or in an `&&` chain. */
function narrowsToError(test: TSESTree.Node, name: string): boolean {
	if (test.type === 'LogicalExpression' && test.operator === '&&') return narrowsToError(test.left, name) || narrowsToError(test.right, name);

	return test.type === 'BinaryExpression' && test.operator === 'instanceof'
		&& test.left.type === 'Identifier' && test.left.name === name
		&& test.right.type === 'Identifier' && errorName.test(test.right.name);
}

/**
 * Flags `t(err.message, …)` where `err` is an `Error`. Once a server translates its errors,
 * that message is display text: looked up as a key it misses, and `t` answers with its
 * fallback — so `t(err.message, 'Something failed')` shows the generic English instead of
 * the server's sentence. Render a caught error with `renderText(textOfError(err), t)`, which
 * translates only an error that still carries a key.
 *
 * `err` is an error when it is declared as one (`err: Error`, `= new ApiError(…)`) or the
 * call sits behind `err instanceof …Error`.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		function isError(identifier: TSESTree.Identifier): boolean {
			const declared = ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier)?.defs[0];

			if (declared) {
				if (declared.name.type === 'Identifier' && isErrorTypeNode(declared.name.typeAnnotation?.typeAnnotation)) return true;

				const init = declared.node.type === 'VariableDeclarator' ? declared.node.init : null;

				if (init?.type === 'NewExpression' && init.callee.type === 'Identifier' && errorName.test(init.callee.name)) return true;
			}

			for (let child: TSESTree.Node = identifier, parent: TSESTree.Node | undefined = identifier.parent; parent; child = parent, parent = parent.parent) {
				if ((parent.type === 'IfStatement' || parent.type === 'ConditionalExpression') && parent.consequent === child && narrowsToError(parent.test, identifier.name)) return true;
				if (parent.type === 'LogicalExpression' && parent.operator === '&&' && parent.right === child && narrowsToError(parent.left, identifier.name)) return true;
			}

			return false;
		}

		return {
			CallExpression(node: TSESTree.CallExpression) {
				if (node.callee.type !== 'Identifier' || node.callee.name !== 't') return;

				const [first] = node.arguments;
				const arg = first?.type === 'ChainExpression' ? first.expression : first;

				if (arg?.type !== 'MemberExpression' || arg.computed || arg.property.type !== 'Identifier' || arg.property.name !== 'message') return;

				const object = arg.object.type === 'TSNonNullExpression' ? arg.object.expression : arg.object;

				if (object.type === 'Identifier' && isError(object)) {
					context.report({ messageId: 'translatedMessage', node });
				}
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description: 'Disallow translating an error\'s message with t(); render the error with renderText(textOfError(err), t).'
		},
		messages: {
			translatedMessage:
				'An error\'s message can already be display text, which t() looks up as a key and replaces with its fallback. Use renderText(textOfError(err), t).'
		},
		schema: [],
		type: 'problem'
	}
});
