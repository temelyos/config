import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-spread-input-into-write-item.js';

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
	'no-spread-input-into-write-item',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			// The whole request, straight into an insert
			{
				code: `const route = t.mutation(async ({ ctx, input }) => repo.insert({ context: { session: ctx.session }, item: { ...input, accessLevel } }));`,
				errors: [{ messageId: 'spreadInputIntoItem' }]
			},
			// The nested request shape, with a resolved row added beside it
			{
				code: `const route = t.mutation(async ({ ctx, input }) => repo.insert({ context, ...input, item: { ...input.item, dashboard } }));`,
				errors: [{ messageId: 'spreadInputIntoItem' }]
			},
			// An update built the same way
			{
				code: `const route = t.mutation(async ({ ctx, input }) => {
					await repo.update({ context, item: { ...input.item, _id: input._id } });
				});`,
				errors: [{ messageId: 'spreadInputIntoItem' }]
			},
			// A multi-line item reads no differently
			{
				code: `const route = t.mutation(async ({ ctx, input }) => {
					await repo.insert({
						context,
						item: {
							...input,
							user: { _id: ctx.session.userId }
						}
					});
				});`,
				errors: [{ messageId: 'spreadInputIntoItem' }]
			},
			// The request bound as a whole parameter rather than destructured
			{
				code: `const route = t.mutation(async (options) => {
					const { input } = options;
					await repo.insert({ context, item: { ...input } });
				});`,
				errors: [{ messageId: 'spreadInputIntoItem' }]
			},
			// A cast on the item changes nothing about what went in
			{
				code: `const route = t.mutation(async ({ ctx, input }) => {
					await repo.insert({ context, item: { ...input, order } as AddHours });
				});`,
				errors: [{ messageId: 'spreadInputIntoItem' }]
			},
			// One resolved join does not excuse the rest of the request
			{
				code: `const route = t.mutation(async ({ ctx, input }) => {
					const effect = await findEffectChannel(module, context, input.effect);
					await repo.insert({ context, item: { ...input, effect } });
				});`,
				errors: [{ messageId: 'spreadInputIntoItem' }]
			}
		],
		valid: [
			// The shape the rule is asking for: the joins named, the remainder spread
			{
				code: `const route = t.mutation(async ({ ctx, input }) => {
					const { owner, ...rest } = input;
					const ownerRow = await users.resolveReferences({ context, field: 'owner', ids: owner });
					await repo.insert({ context, item: { ...rest, owner: ownerRow } });
				});`
			},
			// The remainder of the nested request shape, under whatever name
			{
				code: `const route = t.mutation(async ({ ctx, input }) => {
					const { accessLevel: accessLevelId, ...item } = input.item;
					await repo.insert({ context, item: { ...item, accessLevel } });
				});`
			},
			// A remainder that happens to be called `input` is still the remainder
			{
				code: `const route = t.mutation(async ({ ctx, options }) => {
					const { owner, ...input } = options;
					await repo.insert({ context, item: { ...input, owner: ownerRow } });
				});`
			},
			// The request is fine everywhere it is not the item
			{
				code: `const route = t.mutation(async ({ ctx, input }) => repo.insert({ context, ...input, item: { ...rest, accessLevel } }));`
			},
			// Including a where clause, which names rows rather than writing them
			{
				code: `const route = t.query(async ({ ctx, input }) => repo.find({ context, where: { ...input } }));`
			},
			// A named field of the request is a value somebody picked, not the request
			{
				code: `const route = t.mutation(async ({ ctx, input }) => repo.insert({ context, item: { ...input.item.settings } }));`
			},
			// A module-level `input` is not a handler binding, so the rule claims nothing
			{
				code: `const input = buildDefaults();
				await repo.insert({ context, item: { ...input } });`
			},
			// An ordinary spread of a value the handler assembled
			{
				code: `const route = t.mutation(async ({ ctx, input }) => {
					const item = toWrite(input);
					await repo.insert({ context, item: { ...item, owner: ownerRow } });
				});`
			}
		]
	}
);
