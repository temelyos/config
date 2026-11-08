import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-untyped-where.js';

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
	'no-untyped-where',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			// A filter over an inline shape, in an annotation
			{
				code: `const where: ObjFilter<{ _id: string }> = { _id: id };`,
				errors: [{ messageId: 'inlineFilterShape' }]
			},
			// Same shape as a parameter type
			{
				code: `function load(where: ObjFilter<{ name: string }>) { return where; }`,
				errors: [{ messageId: 'inlineFilterShape' }]
			},
			// Same shape behind a namespace import
			{
				code: `const where: mongo.ObjFilter<{ _id: string }> = { _id: id };`,
				errors: [{ messageId: 'inlineFilterShape' }]
			},
			// `as never` on the clause
			{
				code: `await repo.find({ context, where: { eventHistory: { $in: ids } } as never });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// `as never` on an identifier handed to the clause
			{
				code: `await repo.count({ context, where: onOrder as never });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// The derive-from-signature form on a declared filter
			{
				code: `const where = { assignments: { $exists: true } } as Parameters<typeof this.find>[0]['where'];`,
				errors: [{ messageId: 'castWhere' }]
			},
			// A double cast reports once, on the outer one
			{
				code: `await repo.find({ context, where: filter as unknown as ObjFilter<Entity> });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// A filter over anything is the erasure with a filter type wrapped round it
			{
				code: `const entityWhere = { organization: { _id: orgId } } as ObjFilter<AnyObject>;`,
				errors: [{ messageId: 'castWhere' }]
			},
			// The cast one step out, on the options object holding the clause
			{
				code: `await hours.count({ context, where: onOrder } as never);`,
				errors: [{ messageId: 'castWhere' }]
			},
			// A cast on a spread fragment erases the checking of its keys
			{
				code: `const where: ObjFilter<PrivateUser> = { contactMethods: { $elemMatch: m }, ...({ organizations: orgId } as never) };`,
				errors: [{ messageId: 'castWhere' }]
			},
			// Through a conditional branch of the clause
			{
				code: `await repo.find({ context, where: isGlobal ? ({} as never) : { 'organization._id': orgId } });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// The derive-from-signature form reached through an options type
			{
				code: `const where = { targets: { $exists: false } } as NonNullable<Parameters<UserRepo['find']>[0]['where']>;`,
				errors: [{ messageId: 'castWhere' }]
			},
			// Naming the derivation does not hide it
			{
				code: `type ProductWhere = Parameters<Context['repositories']['products']['count']>[0]['where'];
					const where = { image: fileId } as ProductWhere;`,
				errors: [{ messageId: 'castWhere' }]
			},
			// The same alias exported, and used before it is declared
			{
				code: `const where = { image: fileId } as ProductWhere;
					export type ProductWhere = Parameters<ProductRepo['count']>[0]['where'];`,
				errors: [{ messageId: 'castWhere' }]
			},
			// A `*Where` name carries the position too
			{
				code: `const candidateWhere = { value: { $in: values } } as never;`,
				errors: [{ messageId: 'castWhere' }]
			},
			// `AnyObject` says the same as `any`, cast as well as annotated
			{
				code: `await store.lease({ key, repository: this, where: where as AnyObject });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// Naming the model does not rescue a cast over a literal written right here:
			// the collection is already fixed by the repository, and `as` on a literal only
			// asks for overlap
			{
				code: `await repos.users.find({ context, where: { roles: { $in: roleIds } } as ObjFilter<PrivateUser> });`,
				errors: [{ messageId: 'castWhere' }]
			},
			{
				code: `const where = { 'name.en': RoleNames.SystemAdministrator } as ObjFilter<Role>;`,
				errors: [{ messageId: 'castWhere' }]
			},
			// The same cast on an assembled literal, one `$or` arm in
			{
				code: `await repo.find({ context, where: { $or: [{ 'accessLevels._id': id } as ObjFilter<PrivateUser>, { roles: ids }] } });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// And an erasing cast inside a `$or` arm, which moving it inward used to hide
			{
				code: `await repo.find({ context, where: { $or: [{ attachments: { $exists: true } } as never] } });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// Nested one operator deeper
			{
				code: `const where = { $and: [{ $or: [{ receipt: { $exists: true } } as never] }] };
					await repo.find({ context, where });`,
				errors: [{ messageId: 'castWhere' }]
			},
			// Even an alias that resolves to the right filter: the point is that a cast is
			// reported once and the alias walk terminates, self-reference included
			{
				code: `type EntityWhere = ObjFilter<z.infer<typeof Entity>>;
					const where = { 'organization._id': orgId } as EntityWhere;`,
				errors: [{ messageId: 'castWhere' }]
			},
			{
				code: `type Loop = Loop;
					const where = {} as Loop;`,
				errors: [{ messageId: 'castWhere' }]
			},
			// An any-keys-at-all accumulator handed to a read
			{
				code: `const where: Record<string, unknown> = { _id: id };
					const rows = await repo.find({ context, where }).toArray();`,
				errors: [{ messageId: 'untypedFilterVariable' }]
			},
			// `AnyObject` is the same annotation under another name
			{
				code: `const where: AnyObject = { _id: { $in: ids } };
					where.$and = [restriction];
					await foreign.find({ context, where }).toArray();`,
				errors: [{ messageId: 'untypedFilterVariable' }]
			},
			// Explicitly, rather than by shorthand, and under a `*Where` name
			{
				code: `const curWhere: AnyObject = {};
					result.push({ select: curSelect, where: curWhere });`,
				errors: [{ messageId: 'untypedFilterVariable' }]
			},
			// A bare `any` says even less
			{
				code: `const where: any = { _id: id };
					await repo.deleteWhere({ context, where });`,
				errors: [{ messageId: 'untypedFilterVariable' }]
			},
			// Two holes in one clause report separately
			{
				code: `const where = { a: 1 } as never;
					await repo.find({ context, where: { b: 2 } as never });`,
				errors: [{ messageId: 'castWhere' }, { messageId: 'castWhere' }]
			}
		],

		valid: [
			// The rule's own reference shape
			{
				code: `const where: ObjFilter<z.infer<typeof Affiliation>> = { 'organization._id': orgId, 'user._id': userId };
					await repo.find({ context, where }).toArray();`
			},
			// `satisfies` checks the literal, so it is not a cast
			{
				code: `await repo.find({ context, where: { 'user._id': userId } satisfies ObjFilter<z.infer<typeof Affiliation>> });`
			},
			// A clause written inline is contextually typed by the call
			{
				code: `await repo.find({ context, where: { 'roles._id': { $in: roleIds } } });`
			},
			// A filter over the whole model, not an inline shape
			{
				code: `const where: ObjFilter<PrivateUser> = { contactMethods: { $elemMatch: match } };`
			},
			// `ObjFilter` over a generic parameter is not an inline shape
			{
				code: `function scope<T extends object>(session: SessionClaims): ObjFilter<T> { return {}; }`
			},
			// A cast on a VALUE inside the clause is not a cast on the clause
			{
				code: `await repo.find({ context, where: { _id: id as string, status: status as Status } });`
			},
			// A cast somewhere else entirely
			{
				code: `const rows = await repo.find({ context }).toArray() as unknown as StaleEntry[];`
			},
			// An `update`, not a `where`
			{
				code: `await repo.updateOne({ context, update: { $set: { allocations } } as never, where: { _id: id } });`
			},
			// A cast on an options object with no clause in it
			{
				code: `await repo.insert({ context, item } as never);`
			},
			// An any-keys variable named `where` that never becomes a clause
			{
				code: `const where: AnyObject = { _id: id };
					logger.info(JSON.stringify(where));`
			},
			// An accumulator not named for a filter is somebody else's problem
			{
				code: `const projection: AnyObject = {};
					await repo.find({ context, where: projection });`
			},
			// A typed clause variable passed on, with no annotation to object to
			{
				code: `const where = { 'order._id': orderId } satisfies ObjFilter<z.infer<typeof Hours>>;
					await hours.count({ context, where });`
			},
			// A `where` on something that is not a filter at all
			{
				code: `const field = { path: 'roles', toRepository: 'roles', type: 'oneToMany', where: { isActive: true } };`
			},
			// A cast over a value from OUTSIDE is a reviewable claim about which collection
			// the filter is for: the wire type of a generic find endpoint cannot be an
			// `ObjFilter`, so there is no annotation to write in its place
			{
				code: `const where = input.where as ObjFilter<PrivateUser> | undefined;
					await repo.findOne({ context, where });`
			},
			{
				code: `await repo.find({ context, where: visibility.where as ObjFilter<WorkOrder> });`
			},
			// A type PARAMETER has no model to name but itself, in a scope plugin...
			{
				code: `function scopeFilter<T extends object>(session: SessionClaims): ObjFilter<T> { return { organization: { $exists: false } } as ObjFilter<T>; }`
			},
			// ...and in the repository engine, where it arrives wrapped
			{
				code: `class Repository<T extends RepositorySchema> {
						byId(id: string) { return this.applyScope({ _id: id } as ObjFilter<z.infer<T>>, context); }
					}`
			},
			// An array that is not a `$`-operator clause is not a where position
			{
				code: `await repo.find({ context, where: { tags: { $in: [{ _id: id } as never] } } });`
			},
			// `as const` narrows the literal rather than relaxing it
			{
				code: `await repo.find({ context, where: { status: 'draft' } as const });`
			},
			// A joinScope descriptor happens to hold a `where`, and is not a clause at all
			{
				code: `const scope = { bypass: true, select: true, where: () => undefined } as const;`
			},
			// One step out, a cast naming a real type is a claim about the OPTIONS
			{
				code: `await repo.find({ context, where: { _id: id } } as FindOptions<typeof Widget>);`
			},
			// An annotation is not a cast, whatever the alias holds
			{
				code: `type EntityWhere = ObjFilter<z.infer<typeof Entity>>;
					const where: EntityWhere = { 'organization._id': orgId };`
			}
		]
	}
);
