import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-parallel-transaction-start.js';

// ESLint's RuleTester drives its cases through describe()/it() hooks. Point them
// at node:test so each valid/invalid case becomes a real subtest under the runner.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'ts' },
		sourceType: 'module'
	}
});

ruleTester.run(
	'no-parallel-transaction-start',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			// Bare call, parallel awaits as the first expression statement
			{
				code: `withTransaction(context, async (txCtx) => {
					await Promise.all([entries.insert(a, txCtx), entries.insert(b, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Method call on `this`, parallel reads destructured in the first declaration
			{
				code: `return this.withTransaction(context, async (txCtx) => {
					const [entry, hours] = await Promise.all([this.findOne(where, txCtx), hoursRepo.find(where, txCtx)]);
					return entry;
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Method call on a repository handle
			{
				code: `await repo.withTransaction({ session: ctx.session }, async (txCtx) => {
					await Promise.all([repo.updateOne(x, txCtx), repo.updateOne(y, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Receiver is itself a call — `entries().withTransaction(...)`
			{
				code: `entries().withTransaction(contextOf(ctx.session), async (context) => {
					const [one, two] = await Promise.all([load(context), loadOther(context)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// allSettled starts a transaction just as badly as all
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await Promise.allSettled([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Combinator buried inside the first statement rather than awaited directly
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const rows = (await Promise.all([repo.find(a, txCtx), repo.find(b, txCtx)])).flat();
					return rows;
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Mapped work is still the first operation
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await Promise.all(ids.map(async (id) => repo.deleteOne({ _id: id }, txCtx)));
					await repo.insert(summary, txCtx);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Concise arrow body: the whole callback is the parallel start
			{
				code: `repo.withTransaction(context, async (txCtx) => Promise.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]));`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// A plain function expression callback, not an arrow
			{
				code: `repo.withTransaction(context, async function (txCtx) {
					await Promise.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// A computed timestamp ahead of it opens nothing: the parallel work is still
			// the transaction's first operation
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const now = new Date();
					await Promise.all([repo.insert({ ...a, now }, txCtx), repo.insert({ ...b, now }, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Destructuring a plain object touches no collection
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const { from, to } = input.range;
					await Promise.all([repo.find({ from }, txCtx), repo.find({ to }, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Nor does building a string
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const label = \`\${input.name} (\${input.code})\`;
					await Promise.all([repo.insert({ label }, txCtx), history.insert({ label }, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// However many of them there are
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const now = new Date();
					const { from, to } = input.range;
					const label = \`\${input.name}\`;
					const [entry, hours] = await Promise.all([repo.insert({ from, label, now }, txCtx), hoursRepo.insert({ to }, txCtx)]);
					return entry;
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// A helper DECLARATION performs no operation however much awaiting its body
			// does, so the combinator below is still the transaction's first operation
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					async function warm(id) {
						return await repo.findOne({ _id: id }, txCtx);
					}
					await Promise.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
					return warm(a._id);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Not a widening guard — an arrow helper was already skipped, because the old
			// child-level check caught it. Here to pin that behaviour while the top-level
			// function check carries the declaration form above.
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const warm = async (id) => await repo.findOne({ _id: id }, txCtx);
					await Promise.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
					return warm(a._id);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// race issues every operation in the list too; keeping only the first answer
			// does not un-issue the rest
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await Promise.race([repo.findOne(a, txCtx), repo.findOne(b, txCtx)]);
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// as does any
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const first = await Promise.any([repo.findOne(a, txCtx), repo.findOne(b, txCtx)]);
					return first;
				});`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			},
			// Guards the over-broad fix, not the rule as it stands: exempting any call
			// with a third argument would let this through, and `needsPreviousState` is
			// how the SDK's own repository passes it
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await Promise.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
				}, this.plugins.needsPreviousState);`,
				errors: [{ messageId: 'parallelFirstOperation' }]
			}
		],

		valid: [
			// The transaction opens on a single operation; parallel work after it is fine
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await repo.insert(a, txCtx);
					await Promise.all([repo.insert(b, txCtx), repo.insert(c, txCtx)]);
				});`
			},
			// First statement is a single awaited read
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const row = await repo.findOne(where, txCtx);
					const [x, y] = await Promise.all([load(row, txCtx), loadOther(row, txCtx)]);
					return x;
				});`
			},
			// A helper declared first and called later: the combinator runs when the
			// helper runs, which is after the transaction is open
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const loadBoth = async () => Promise.all([repo.find(a, txCtx), repo.find(b, txCtx)]);
					await repo.insert(seed, txCtx);
					return loadBoth();
				});`
			},
			// Same exemption for a function declaration
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					async function loadBoth() {
						return Promise.all([repo.find(a, txCtx), repo.find(b, txCtx)]);
					}
					await repo.insert(seed, txCtx);
					return loadBoth();
				});`
			},
			// The helper declaration is not an operation, so the first operation is the
			// call in statement two — the combinator is inside the helper, not inside it
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					const loadBoth = async () => Promise.all([repo.find(a, txCtx), repo.find(b, txCtx)]);
					const [x, y] = await loadBoth();
					return x ?? y;
				});`
			},
			// Parallel work nested in a callback the first operation passes along
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await repo.forEachBatch(async (batch) => Promise.all(batch.map((row) => repo.insert(row, txCtx))), txCtx);
				});`
			},
			// Not a transaction at all
			{
				code: `await Promise.all([loadA(), loadB()]);`
			},
			{
				code: `await runInBatch(async () => {
					await Promise.all([loadA(), loadB()]);
				});`
			},
			// A non-parallel Promise member is not a parallel start
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await Promise.resolve(repo.insert(a, txCtx));
				});`
			},
			// A combinator on something other than Promise
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await Bluebird.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
				});`
			},
			// Nothing to flag in an empty callback
			{
				code: `repo.withTransaction(context, async () => {});`
			},
			// `useTransaction: false` runs the callback untransacted, so there is no
			// transaction for the parallel work to fail to open
			{
				code: `repo.withTransaction(context, async (txCtx) => {
					await Promise.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
				}, false);`
			}
		]
	}
);
