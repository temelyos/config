import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'parallelFirstOperation';

export type Options = [];

const parallelCombinators = new Set(['all', 'allSettled', 'any', 'race']);

/**
 * The child nodes of `node`, skipping the `parent` back-reference that would otherwise
 * walk the tree upwards forever.
 */
function* childNodes(node: TSESTree.Node): Generator<TSESTree.Node> {
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent') {
			continue;
		}

		for (const item of Array.isArray(value) ? value : [value]) {
			if (item !== null && typeof item === 'object' && typeof (item as TSESTree.Node).type === 'string') {
				yield item as TSESTree.Node;
			}
		}
	}
}

/**
 * True when running `node` reaches the database: it awaits something, or it hands work to
 * a promise combinator. Nested function bodies don't count — they run when they are
 * called, not when the statement holding them does — so a statement that only computes
 * (a `new Date()`, a destructure, a template string, a helper declaration) is not an
 * operation, and the transaction is still unopened after it.
 */
function hasOperation(node: TSESTree.Node): boolean {
	// The statement itself may BE a function — `async function warm() { await … }` as the
	// first statement declares work, it doesn't do any. Without this the declaration
	// counts as the first operation and the rule switches itself off for the statement
	// that matters; the child guard below never sees the node it was called with.
	if (isFunctionNode(node)) {
		return false;
	}

	if (node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await)) {
		return true;
	}

	if (node.type === 'CallExpression' && isParallelCombinatorCall(node)) {
		return true;
	}

	for (const child of childNodes(node)) {
		if (hasOperation(child)) {
			return true;
		}
	}

	return false;
}

/** True when `node` is a function of any kind — the boundary both walks stop at. */
function isFunctionNode(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression {
	return (
		node.type === 'ArrowFunctionExpression'
		|| node.type === 'FunctionDeclaration'
		|| node.type === 'FunctionExpression'
	);
}

/**
 * True when `node` hands a list of operations to `Promise` at once — `all`,
 * `allSettled`, `race` or `any`. Which result the combinator keeps is irrelevant: every
 * operation in the list is issued together, so all four start a transaction in parallel.
 */
function isParallelCombinatorCall(node: TSESTree.CallExpression): boolean {
	const { callee } = node;

	return (
		callee.type === 'MemberExpression'
		&& !callee.computed
		&& callee.object.type === 'Identifier'
		&& callee.object.name === 'Promise'
		&& callee.property.type === 'Identifier'
		&& parallelCombinators.has(callee.property.name)
	);
}

/**
 * True when `fn` is the callback handed to a `withTransaction(...)` call. The receiver
 * is anything — `withTransaction(ctx, cb)`, `this.withTransaction(ctx, cb)`,
 * `repo.withTransaction(ctx, cb)`, `entries().withTransaction(ctx, cb)` — and the
 * callback's argument position is not fixed, so we only ask that this function is one
 * of the call's arguments.
 */
function isTransactionCallback(fn: TSESTree.Node): boolean {
	const call = fn.parent;

	if (call?.type !== 'CallExpression' || !call.arguments.includes(fn as TSESTree.CallExpressionArgument)) {
		return false;
	}

	const { callee } = call;

	const isWithTransaction = callee.type === 'Identifier'
		? callee.name === 'withTransaction'
		: (
			callee.type === 'MemberExpression'
			&& callee.property.type === 'Identifier'
			&& callee.property.name === 'withTransaction'
		);

	if (!isWithTransaction) {
		return false;
	}

	// `withTransaction(context, fn, false)` runs the callback untransacted (the third
	// parameter is `useTransaction = true`), so there is no transaction for parallel
	// work to fail to open.
	const useTransaction = call.arguments[2];

	return !(useTransaction?.type === 'Literal' && useTransaction.value === false);
}

/**
 * Flags a promise combinator (`all`, `allSettled`, `race`, `any`) among the first
 * operations of a `withTransaction` callback (repository rule 7).
 *
 * Mongo will not open a transaction on parallel operations: the concurrent first reads
 * or writes race to start the transaction and the server answers
 * error 117 (NoSuchTransaction). Mingo, which every spec runs on, has no transaction
 * state to violate and runs the same code happily — so this only ever surfaces in
 * production, and no test can be written that catches it. Run the first operation on
 * its own; once the transaction is open, parallel work inside it is fine.
 *
 * What counts is the first statement that performs an operation, not the first statement:
 * a `const now = new Date()` ahead of the parallel work leaves the transaction just as
 * unopened, so statements that only compute are skipped. A combinator inside a helper
 * function declared in the callback is left alone either way — it runs whenever the
 * helper is called, which is necessarily later.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		return {
			CallExpression(node) {
				if (!isParallelCombinatorCall(node)) {
					return;
				}

				// Walk out to the innermost enclosing function. If that isn't the
				// transaction callback, this combinator belongs to a helper declared
				// inside it — which runs when the helper is called, later — or to
				// unrelated code.
				let enclosing: TSESTree.Node | undefined = node.parent;

				while (enclosing && !isFunctionNode(enclosing)) {
					enclosing = enclosing.parent;
				}

				if (!enclosing || !isTransactionCallback(enclosing)) {
					return;
				}

				const { body } = enclosing;

				// A concise body is the whole callback, so the combinator is its start.
				if (body.type === 'BlockStatement') {
					const first = body.body.find(hasOperation);

					// Sibling statements don't overlap, so containment in the first
					// operative one's range is exactly 'runs as part of the first
					// operation'. A combinator is itself an operation, so the statement
					// holding this node can never be skipped past.
					if (!first || node.range[0] < first.range[0] || node.range[1] > first.range[1]) {
						return;
					}
				}

				context.report({ messageId: 'parallelFirstOperation', node });
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description:
				'Disallow starting a Mongo transaction with parallel operations, which real Mongo rejects with error 117 and the in-memory driver cannot catch.'
		},
		messages: {
			parallelFirstOperation:
				'A transaction cannot start with parallel operations: real Mongo answers error 117, and the in-memory driver every spec runs on will not catch it. Run the first operation on its own, then parallelise the rest. Where this one is safe, disable the rule on the line with the reason; the plugin README lists the cases the rule cannot tell apart.'
		},
		schema: [],
		type: 'problem'
	}
});
