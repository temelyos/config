import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'staleMemo';

export type Options = [];

/** Array methods that call their callback before they return, so a `t` inside runs while the memo builds. */
const iterationMethods = new Set(['every', 'filter', 'find', 'findIndex', 'flatMap', 'forEach', 'map', 'reduce', 'some', 'sort', 'toSorted']);

function calleeName(callee: TSESTree.Expression): string | undefined {
	if (callee.type === 'Identifier') return callee.name;
	if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') return callee.property.name;

	return undefined;
}

function declaresT(fn: TSESTree.FunctionLike): boolean {
	return fn.params.some(isTranslator);
}

function isCallbackOf(fn: TSESTree.Node, call: TSESTree.Node | undefined): call is TSESTree.CallExpression {
	return call?.type === 'CallExpression' && call.arguments.some(arg => arg === fn);
}

function isTranslator(node: TSESTree.Node): boolean {
	return node.type === 'Identifier' && node.name === 't';
}

function keysOnT(deps: TSESTree.ArrayExpression): boolean {
	return deps.elements.some(element => element?.type === 'Identifier' && element.name === 't');
}

/** Whether the memo's dependencies change when the dictionary is swapped. */
function rebuildsOnSwap(deps: TSESTree.ArrayExpression): boolean {
	return deps.elements.some(element =>
		(element?.type === 'Identifier' && element.name === 'dictionary')
		|| (element?.type === 'MemberExpression' && !element.computed && element.property.type === 'Identifier' && element.property.name === 'dictionary'));
}

/**
 * Flags `useMemo(() => … t('Key') …, [t])`. `useDictionary().t` is stable, so a memo keyed on it
 * never rebuilds when the dictionary is swapped and keeps the language it was first built in.
 * `t` only inside a function the memo returns (a handler, a controller callback) is left alone.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		const reported = new WeakSet<TSESTree.CallExpression>();

		return {
			CallExpression(node) {
				if (!isTranslator(node.callee) && !node.arguments.some(isTranslator)) return;

				let current: TSESTree.Node = node;

				while (current.parent) {
					const parent: TSESTree.Node = current.parent;

					if (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression' || current.type === 'FunctionDeclaration') {
						if (declaresT(current) || !isCallbackOf(current, parent)) return;

						const name = calleeName(parent.callee);

						if (name === 'useMemo' && parent.arguments[0] === current) {
							const deps = parent.arguments[1];

							if (deps?.type === 'ArrayExpression' && keysOnT(deps) && !rebuildsOnSwap(deps) && !reported.has(parent)) {
								reported.add(parent);
								context.report({ messageId: 'staleMemo', node });
							}

							return;
						}

						if (!name || !iterationMethods.has(name) || parent.callee.type !== 'MemberExpression') return;
					}

					current = parent;
				}
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description: 'Disallow a `useMemo` that translates with `t` while keyed on `t`, which is stable and never signals a dictionary swap; use `useTranslated`.'
		},
		messages: {
			staleMemo:
				'`t` is stable, so this memo keeps the language it was first built in. Build it with `useTranslated(t => …, deps)`, which rebuilds when the dictionary changes.'
		},
		schema: [],
		type: 'problem'
	}
});
