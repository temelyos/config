import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-model-default.js';

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

// The rule asks the repositories which shapes are stored. A case states that answer
// directly, so the spec needs no workspace on disk.
const STORED = [{ shapes: ['AnalyticsEvent', 'Connection', 'MultiFactorSettings', 'ScheduledJob', 'TimeEntry'] }];

ruleTester.run(
	'no-model-default',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			// A scalar default on a stored row
			{
				code: `export const ScheduledJob = z.strictObject({ enabled: z.boolean().default(true) });`,
				errors: [{ data: { name: 'ScheduledJob' }, messageId: 'modelDefault' }],
				options: STORED
			},
			// An enum default reached through another schema, so the receiver is not `z`
			{
				code: `export const AnalyticsEvent = z.object({ source: AnalyticsEventSource.default('internal') });`,
				errors: [{ messageId: 'modelDefault' }],
				options: STORED
			},
			// A default on a nested object, and on its leaves
			{
				code: `export const MultiFactorSettings = z.strictObject({
					code: z.strictObject({ length: z.number().default(6) }).default({ length: 6 })
				});`,
				errors: [{ messageId: 'modelDefault' }, { messageId: 'modelDefault' }],
				options: STORED
			},
			// Every default counts, not just the first
			{
				code: `export const Connection = z.object({
					schema: z.string().min(1).default('public'),
					ssl: z.boolean().default(true)
				});`,
				errors: [{ messageId: 'modelDefault' }, { messageId: 'modelDefault' }],
				options: STORED
			},
			// A default carried over by `.extend` is a default the repository still will not run
			{
				code: `export const TimeEntry = Auditable.extend({ status: z.enum(['open']).default('open') });`,
				errors: [{ messageId: 'modelDefault' }],
				options: STORED
			}
		],

		valid: [
			// Not a shape any repository stores — a form validator or a plugin
			// settingsSchema is where every suppression this rule used to need came from
			{
				code: `export const ConnectionFormValues = z.object({ ssl: z.boolean().default(true) });`,
				options: STORED
			},
			{
				code: `export const StripeSettings = z.object({ isEnabled: z.boolean().default(false) });`,
				options: STORED
			},
			// A request's own paging default is the request's business
			{
				code: `export const ListEntriesRequest = z.object({ limit: z.number().int().default(50) });`,
				options: STORED
			},
			// The exemption survives nesting inside the request
			{
				code: `export const SendMessageRequest = z.object({ options: z.object({ stream: z.boolean().default(true) }) });`,
				options: STORED
			},
			// `default` on something that is not a zod shape at all. Without the
			// shape check this rule is an error that a name collision can trip.
			{
				code: `const value = settings.default(1);`,
				options: STORED
			},
			{
				code: `export function read(settings) { return settings.default(1); }`,
				options: STORED
			},
			// A stored row with no default
			{
				code: `export const ScheduledJob = z.strictObject({ enabled: z.boolean() });`,
				options: STORED
			},
			// `default` read rather than called is not a zod default
			{
				code: `export const ScheduledJob = z.object({ mode: MODES.default });`,
				options: STORED
			},
			// A computed member named by a variable that happens to hold 'default'
			{
				code: `export const ScheduledJob = z.object({ mode: MODES[key]('async') });`,
				options: STORED
			},
			// An imported module's default export, not a schema default
			{
				code: `const loaded = await import('./shape'); export const Shape = loaded.default;`,
				options: STORED
			}
		]
	}
);
