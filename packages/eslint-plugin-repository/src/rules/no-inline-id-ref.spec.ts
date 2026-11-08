import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-inline-id-ref.js';

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

// The shapes the repositories store, stated per case so the spec needs no workspace.
const STORED = [{ shapes: ['AddressBook', 'AiChatTurn', 'DataSource', 'RateCard', 'Row', 'SupplierMatch', 'Ticket', 'UpdatedByInfo'] }];

ruleTester.run(
	'no-inline-id-ref',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			// A join on a stored shape declared as a bare id partial
			{
				code: `export const AiChatTurn = z.strictObject({ startedBy: z.object({ _id: z.string() }) });`,
				errors: [{ data: { name: 'AiChatTurn' }, messageId: 'inlineIdRef' }],
				options: STORED
			},
			// A read model pinning the join to the fields it wanted that day
			{
				code: `export const SupplierMatch = z.object({ entity: z.object({ _id: z.string(), name: z.string() }) });`,
				errors: [{ messageId: 'inlineIdRef' }],
				options: STORED
			},
			// Optional does not change what the shape is
			{
				code: `export const Ticket = z.object({ entity: z.object({ _id: objectId }).optional() });`,
				errors: [{ messageId: 'inlineIdRef' }],
				options: STORED
			},
			// A quoted key is the same key
			{
				code: `export const Row = z.object({ user: z.object({ '_id': z.string() }) });`,
				errors: [{ messageId: 'inlineIdRef' }],
				options: STORED
			},
			// An array of partials is still a partial per element
			{
				code: `export const RateCard = z.strictObject({ roles: z.object({ _id: z.string(), name: z.string() }).array() });`,
				errors: [{ messageId: 'inlineIdRef' }],
				options: STORED
			},
			// Strict does not make a partial the joined model
			{
				code: `export const Row = z.object({ user: z.strictObject({ _id: z.string() }) });`,
				errors: [{ messageId: 'inlineIdRef' }],
				options: STORED
			},
			// Two joins, two sites
			{
				code: `export const DataSource = z.object({
					accessLevel: z.object({ _id: z.string(), name: z.string() }),
					connection: z.object({ _id: z.string(), name: z.string() })
				});`,
				errors: [{ messageId: 'inlineIdRef' }, { messageId: 'inlineIdRef' }],
				options: STORED
			},
			// `Add`/`Update` is only a write model when the file declares the base it is
			// named for. `AddressBook` is not `Add` + `ressBook`.
			{
				code: `export const AddressBook = z.object({ owner: z.object({ _id: z.string() }) });`,
				errors: [{ data: { name: 'AddressBook' }, messageId: 'inlineIdRef' }],
				options: STORED
			},
			{
				code: `export const UpdatedByInfo = z.object({ by: z.object({ _id: z.string() }) });`,
				errors: [{ data: { name: 'UpdatedByInfo' }, messageId: 'inlineIdRef' }],
				options: STORED
			}
		],

		valid: [
			// Rule 2's shape: an Add model takes the join as a ref under the same key,
			// and the file declares the base it is named for
			{
				code: `export const UserSession = z.strictObject({ user: BasicUser });
					export const AddUserSession = UserSession.omit({ _id: true }).extend({ user: z.object({ _id: z.string() }) });`,
				options: STORED
			},
			// The same for an Update model
			{
				code: `export const ScheduledJobRun = z.strictObject({ _id: objectId });
					export const UpdateScheduledJobRun = ScheduledJobRun.extend({ organization: z.object({ _id: objectId }).optional() });`,
				options: STORED
			},
			// The ref helper itself is the form the rule points sites at
			{
				code: `const idRef = z.object({ _id: z.string() });`,
				options: STORED
			},
			// The helper is still the helper with a chain on the end
			{
				code: `const optionalIdRef = z.object({ _id: objectId }).optional();`,
				options: STORED
			},
			// A shape no repository stores
			{
				code: `export const RoleListItem = z.object({ organization: z.object({ _id: z.string() }) });`,
				options: STORED
			},
			// A read model declaring the join as the joined model — what rule 1 asks for
			{
				code: `export const Row = z.strictObject({ _id: z.string(), user: BasicUser });`,
				options: STORED
			},
			// The helper used by name
			{
				code: `export const Row = z.object({ organization: idRef, user: idRef });`,
				options: STORED
			},
			// The row's own `_id`, which is a field and not a join
			{
				code: `export const Row = z.object({ _id: z.string(), sessionId: z.string() });`,
				options: STORED
			},
			// A nested value object that declares no `_id`
			{
				code: `export const Row = z.object({ name: z.object({ first: z.string() }) });`,
				options: STORED
			},
			// A polymorphic reference is not an id join — it carries its own contract
			{
				code: `export const Row = z.object({ subject: z.object({ id: z.string(), namespace: z.string() }) });`,
				options: STORED
			},
			// Not a zod object call
			{
				code: `export const Row = build({ _id: z.string() });`,
				options: STORED
			},
			// A zod object given no shape literal
			{
				code: `export const Row = z.object();`,
				options: STORED
			}
		]
	}
);
