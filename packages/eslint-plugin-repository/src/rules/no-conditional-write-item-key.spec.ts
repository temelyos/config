import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-conditional-write-item-key.js';

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
	'no-conditional-write-item-key',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			// The plain form: a key guarded into an insert item
			{
				code: `await repo.insert({ context, item: { name, ...(logoFiles && { logoFiles }) } });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// The ternary form, with the empty branch second
			{
				code: `await repo.insert({ context, item: { ...base, ...(orgId ? { organization: { _id: orgId } } : {}) } });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// The inverted ternary, where the empty branch comes first
			{
				code: `await repo.insert({ context, item: { username, ...(isExternal ? {} : { signupVerificationPending: true }) } });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// `$set` under an `update:` clause is an item even though the clause is not
			{
				code: `await this.updateOne({ context, update: { $set: { expiresAt, ...(meta.ipAddress && { ip: meta.ipAddress }) } }, where });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// `$setOnInsert` is cleaned the same way `$set` is
			{
				code: `await this.updateOne({ context, update: { $setOnInsert: { ...(candidate && { candidate }) } }, upsert: true, where });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// updateById carries the same clause
			{
				code: `await this.updateById({ context, id, update: { $set: { status, ...(hasStamp && { closedAt }) } } });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// A plain object nested in the item: the repository's clean recurses into it
			{
				code: `await repo.insert({ context, item: { settings: { locale, ...(zone && { zone }) } } });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// A quoted key names the item just as well
			{
				code: `await repo.insert({ context, 'item': { ...(accessLevel && { accessLevel }) } });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// Each guarded key is its own report
			{
				code: `await repo.insert({ context, item: { ...(accessLevel && { accessLevel }), ...(connection && { connection }) } });`,
				errors: [{ messageId: 'conditionalItemKey' }, { messageId: 'conditionalItemKey' }]
			},
			// processInsertItem's result is the item
			{
				code: `class R {
					protected override async processInsertItem(item, context) {
						return { ...item, ...(organization ? { organization } : {}) };
					}
				}`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// processUpdateItem's is too
			{
				code: `class R {
					protected override async processUpdateItem(item, context) {
						return { ...item, ...(context.session ? { reviewedBy: { _id: context.session.userId } } : {}) };
					}
				}`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// So is a buildUpdate helper's, wherever it is declared
			{
				code: `function buildUpdate(context) {
					return { deletedAt: new Date(), ...(context.session && { deletedBy: { _id: context.session.userId } }) };
				}`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// Client API: the argument object IS the item, with no context or where on it
			{
				code: `const created = await Invoices.insert({ ...item, data, ...(expected && { expected }) });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// Client API through a controller's handle
			{
				code: `await this._deals.insert({ ...item, ...(owner && { owner }), probability });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// Client API update, which drops undefined on the way to the same repository
			{
				code: `await Shifts.update({ _id, ...(timezone && { timezone }) });`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// A cast around the argument hides nothing about what is written
			{
				code: `await Shifts.insert({ ...values, ...(linked.length && { subjects: linked }) } as never);`,
				errors: [{ messageId: 'conditionalItemKey' }]
			},
			// The item handed ON to a hook is written by whatever the hook writes
			{
				code: `class R {
					protected override async processInsertItem(item, context) {
						return super.processInsertItem({ ...item, ...(item.parameters && { parameters: filled(item.parameters) }) }, context);
					}
				}`,
				errors: [{ messageId: 'conditionalItemKey' }]
			}
		],
		valid: [
			// A `where` key set to undefined filters for undefined — the guard is the shape
			{
				code: `await this.updateMany({ context, update: { $set: { revokedAt: new Date() } }, where: { user: { _id: userId }, ...(exceptSessionId && { sessionId: { $ne: exceptSessionId } }) } });`
			},
			// An empty `$inc` is invalid to Mongo, so the operator is added on a condition
			{
				code: `await this.updateOne({ context, update: { ...(Object.keys(increments).length > 0 ? { $inc: increments } : {}), $push: { messages: entry } }, where: { _id: chatId } });`
			},
			// A `$push` entry is written exactly as given
			{
				code: `await this.updateOne({ context, update: { $push: { messages: { role, ...(usage && { usage }) } } }, where });`
			},
			// As is an `$addToSet` entry
			{
				code: `await this.updateOne({ context, update: { $addToSet: { subjects: { id, ...(namespace && { namespace }) } } }, where });`
			},
			// And a `$pull` match
			{
				code: `await this.updateOne({ context, update: { $pull: { subjects: { ...(id && { id }) } } }, where });`
			},
			// A `$unset` path list, where an empty object would be invalid
			{
				code: `await this.driver.updateOne(state, { update: { $unset: { attachments: '', ...(head ? {} : { receipt: '' }) } }, where });`
			},
			// An array element: only plain objects are cleaned, so the guard belongs
			{
				code: `await repo.insert({ context, item: { contactMethods: [{ type: 'email', ...(verified && { verifiedAt }) }] } });`
			},
			// A select is read, not written
			{
				code: `await repo.find({ context, select: { _id: true, ...(wantsName && { name: true }) }, where });`
			},
			// The options object itself is not the item, and `context:` says so
			{
				code: `await repo.insert({ context, item, ...(select && { select }) });`
			},
			// Second-argument options on a raw driver call are not an item either
			{
				code: `await this.driver.updateOne(this.state, { fields: this.fields, ...(roles.length > 0 && { bypassValidation: true }) });`
			},
			// A whole-value spread says nothing about which keys it holds
			{
				code: `await repo.insert({ context, item: { ...base, ...(overrides ?? {}) } });`
			},
			// Nor does a conditional spread of something other than a literal
			{
				code: `await repo.insert({ context, item: { ...base, ...(isDraft && defaults) } });`
			},
			// A read call takes no item
			{
				code: `const rows = await Invoices.query({ ...(direction && { direction }) });`
			},
			// A command or a provider payload is not an item: what it writes is the server's
			// to decide, and the rule knows the write methods and the hooks by name only
			{
				code: `await bookings.create({ ...(answers.length && { answers }), startUtc });`
			},
			{
				code: `await transporter.sendMail({ to, ...(cc && { cc }) });`
			},
			// A computed key is one the rule cannot read, so it claims nothing about it
			{
				code: `await repo.insert({ context, item: { [marker.charged]: { ...(unitPrice !== undefined && { unitPrice }) } } });`
			},
			// An object built in a callback belongs to whoever calls the callback
			{
				code: `await repo.insert({ context, item: { screens: ids.map((id) => ({ id, ...(isDrawn && { drawn: true }) })) } });`
			},
			// A hook's name is what marks its result, and this helper is not one
			{
				code: `function buildProps(context) {
					return { ...base, ...(context.session && { user: context.session.userId }) };
				}`
			},
			// The ordinary object literal the rule has to stay silent on
			{
				code: `const props = { className, ...(isOpen && { open: true }) };`
			},
			// Including one handed to a component or a plain helper
			{
				code: `render(Dialog, { title, ...(subtitle && { subtitle }) });`
			}
		]
	}
);
