import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './strict-storage-model.js';

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

// The rows the repositories store, stated per case so the spec needs no workspace. The
// real index also lists a row's base, which is how `baseVoiceCall` is reported.
const ROWS = [{ shapes: ['baseVoiceCall', 'EventHistory', 'LogEntry', 'Site', 'Visit', 'WorkflowRun'] }];

ruleTester.run(
	'strict-storage-model',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			{
				code: `export const LogEntry = z.object({ _id: z.string(), message: z.string() });`,
				errors: [{ data: { name: 'LogEntry' }, messageId: 'looseStorageModel' }],
				options: ROWS
			},
			// A row's loose base, which is not exported and so is invisible to a rule
			// that reads only exported declarations
			{
				code: `const baseVoiceCall = z.object({ _id: z.string() });
					export const VoiceCall = baseVoiceCall.extend({ to: z.lazy(() => VoiceCall.array().optional()) });`,
				errors: [{ data: { name: 'baseVoiceCall' }, messageId: 'looseStorageModel' }],
				options: ROWS
			},
			// Two rows in one file are two reports
			{
				code: `export const Site = z.object({ _id: z.string() });
					export const Visit = z.object({ _id: z.string() });`,
				errors: [
					{ data: { name: 'Site' }, messageId: 'looseStorageModel' },
					{ data: { name: 'Visit' }, messageId: 'looseStorageModel' }
				],
				options: ROWS
			},
			// Several declarators in one statement are each judged
			{
				code: `export const LogEntry = z.object({ _id: z.string() }), other = z.object({});`,
				errors: [{ data: { name: 'LogEntry' }, messageId: 'looseStorageModel' }],
				options: ROWS
			}
		],

		valid: [
			// Already strict, which is what rule 12 asks for
			{
				code: `export const LogEntry = z.strictObject({ _id: z.string() });`,
				options: ROWS
			},
			// `.strict()` on the end says the same thing
			{
				code: `export const LogEntry = z.object({ _id: z.string() }).strict();`,
				options: ROWS
			},
			// A shape no repository stores: a result, a form's values, a settings payload
			{
				code: `export const AvailableModelsResult = z.object({ models: z.array(z.string()) });`,
				options: ROWS
			},
			{
				code: `export const RoleFormValues = z.object({ name: z.string() });`,
				options: ROWS
			},
			{
				code: `export const SlackSettings = z.object({ isEnabled: z.boolean() });`,
				options: ROWS
			},
			// A value object a row nests is not the row: it can need its own write form
			// before it can be strict, which is design work rather than a flip
			{
				code: `export const Money = z.object({ amount: z.number(), currency: z.string() });`,
				options: ROWS
			},
			// `object` on something that is not `z`. Without the receiver check this
			// rule is an error that a name collision can trip.
			{
				code: `export const LogEntry = lodash.object([['a', 1]]);`,
				options: ROWS
			},
			{
				code: `export const LogEntry = builder.object({ _id: 1 });`,
				options: ROWS
			},
			// Built by composition rather than a bare factory call
			{
				code: `export const LogEntry = Auditable.extend({ _id: z.string() });`,
				options: ROWS
			},
			// A loose object asked for on purpose says so, and is not z.object
			{
				code: `export const LogEntry = z.looseObject({ _id: z.string() });`,
				options: ROWS
			},
			// Not a declarator the rule reads
			{
				code: `export type LogEntry = { _id: string };`,
				options: ROWS
			}
		]
	}
);
