# @temelyos/eslint-plugin-repository

Lint rules for the repository and API conventions a Temelyos module has to follow. The
rules catch the mistakes that type-checking and tests can't: a write that works against the
in-memory driver and fails against Mongo, a contract a caller can lie about. They run under
oxlint as a JS plugin.

## Use it in a module

```sh
pnpm add -D oxlint @temelyos/oxlint-config @temelyos/eslint-plugin-repository
```

```ts
// oxlint.config.ts
import temelyos from '@temelyos/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [temelyos],
	jsPlugins: [{ name: 'repository', specifier: '@temelyos/eslint-plugin-repository' }],
	overrides: [
		{
			files: ['**/*.{ts,mts,cts}'],
			rules: {
				'repository/no-parallel-transaction-start': 'error',
				'repository/no-spread-input-into-write-item': 'error',
				'repository/no-untyped-where': 'error'
			}
		},
		{
			files: ['**/*.{ts,tsx,mts,cts}'],
			rules: { 'repository/no-conditional-write-item-key': 'error' }
		},
		{
			files: ['**/*.{ts,mts,cts}'],
			rules: {
				'repository/no-inline-id-ref': 'error',
				'repository/no-model-default': 'error',
				'repository/strict-storage-model': 'error'
			}
		},
		{
			files: ['**/*.{spec,test}.{ts,mts,cts}'],
			rules: {
				'repository/no-inline-id-ref': 'off',
				'repository/no-model-default': 'off',
				'repository/strict-storage-model': 'off'
			}
		}
	]
});
```

Each rule goes on the files it belongs to:

- The transaction, request and where-clause rules run over every server file. A transaction
  is opened, and a where clause assembled, wherever the work is (a `*-repository.ts`, an
  endpoint, a job, a plain helper), so a repository glob would miss most of their sites.
  `.tsx` is left out: browser code has no session to open a transaction on.
- The write-item rule adds `.tsx`: the client API takes the item as the call's argument, and
  route components make those calls as often as plain modules do.
- The model rules ask the repositories which declarations are storage shapes, so they run
  over every server file too, rather than a `models/` glob that would catch form validators
  and miss feature folders. Specs are left out: they declare fixtures, not stored shapes.

## Rules

### `repository/no-parallel-transaction-start`

Repository rule 7. A transaction cannot open on parallel operations: when a
`withTransaction` callback's first operations are a `Promise.all`, `allSettled`, `race` or
`any`, real Mongo answers error 117 (`NoSuchTransaction`). Mingo, the in-memory driver every
spec runs on, has no transaction state to violate and runs the same code happily, so the
failure only ever appears in production and no test can catch it. Run the first operation on
its own; parallel operations after that are fine.

```ts
// bad — the transaction never opens
await repo.withTransaction(context, async (txCtx) => {
	await Promise.all([repo.insert(a, txCtx), repo.insert(b, txCtx)]);
});

// good — the first operation opens the transaction
await repo.withTransaction(context, async (txCtx) => {
	await repo.insert(a, txCtx);
	await Promise.all([repo.insert(b, txCtx), repo.insert(c, txCtx)]);
});
```

What counts is the first statement that performs an operation, not the first statement: a
`const now = new Date()` or a helper declaration ahead of the parallel work leaves the
transaction just as unopened, so statements that only compute are skipped. A combinator
inside a helper declared in the callback is left alone — the helper runs when it is called,
which is later. So is one under `withTransaction(context, fn, false)`, where the literal
`false` says the callback runs untransacted; a variable in that position is not read.

#### When to disable it

The rule reads one callback's syntax, so it cannot tell these apart from a real parallel
start. Disable it on the line, with the reason:

```ts
// eslint-disable-next-line repository/no-parallel-transaction-start -- pure formatting, no collection is read
const [left, right] = await Promise.all([renderLeft(row), renderRight(row)]);

// eslint-disable-next-line repository/no-parallel-transaction-start -- joins the caller's open transaction, this is not its first operation
const [entry, hours] = await Promise.all([entries.find(where, txCtx), hours.find(where, txCtx)]);

// eslint-disable-next-line repository/no-parallel-transaction-start -- one operation against a timer, so the transaction opens on it
const row = await Promise.race([repo.findOne(where, txCtx), rejectAfter(5000)]);
```

The callback that joins a transaction already open is the common one: whether
`context.transaction` is set is a runtime fact, and the rule flags the shape either way. The
timeout race is the other: the rule cannot weigh what the operands do, so a single operation
raced against a timer looks like two.

#### What it cannot see

Nothing below is caught, so the rule is a net, not a proof:

- **A callback passed by name.** `this.withTransaction(context, exec)` hands over an
  identifier, and the rule never looks inside `exec`. `Repository.deleteById` is written
  this way (`sdk/packages/data-access/src/repository/repository.ts:745`). The same goes for
  a method reference.
- **Parallelism without a combinator.** Two operations started into consts and awaited
  afterwards run in parallel just the same:
  `const a = repo.find(x, txCtx); const b = repo.find(y, txCtx); await a; await b;`
- **An eager `.map` of operations.** `rows.map(row => repo.insert(row, txCtx))` issues
  every insert before anything is awaited, combinator or not.
- **An aliased `Promise`.** The rule matches the `Promise` identifier, so
  `const P = Promise; await P.all([…])` slips through.

### `repository/no-conditional-write-item-key`

Repository rule 5. The repository drops `undefined` keys — joins included — from an insert
or update item and from `$set`, so a value that may be `undefined` is spread as it is.
Adding the key on a condition buys nothing, hides which fields the write covers, and reads
as though sending `undefined` were dangerous, which is how a field ends up impossible to
clear.

```ts
// bad — the guard says nothing the repository doesn't already do
await repo.insert({ context, item: { name, ...(logoFiles && { logoFiles }) } });

// good
await repo.insert({ context, item: { logoFiles: logoFiles || undefined, name } });
```

The inverted form `...(cond ? {} : { x: true })` becomes `x: cond ? undefined : true`.

What counts as an item is decided by what encloses the object, not by the call. The options
object of `repo.insert({ context, item, select })` is not the item; the argument of a
client-API `Invoices.insert({ …fields })` is, and a `context:` or `where:` key is what
tells the two apart. So is the object handed ON to `processInsertItem`,
`processUpdateItem` or `buildUpdate` — those three write what they are given, on the way in
as much as on the way out.

The `item:`/`$set:` anchor is the KEY, never the receiver: an `item:` or a `$set:` in any
object literal reads as a write item, including an aggregation's `$set` stage, where
`undefined` is a value rather than an absence. No such site exists here today; the day one
does, it wants the disable comment. A `where:`, `update:` or `select:` clause is read rather than written
— a `where` key set to `undefined` filters for undefined, and an empty `$inc` is invalid to
Mongo — so a conditional key there is the correct shape. Array elements and
`$push`/`$addToSet`/`$pull`/`$unset` entries are written verbatim, which rule 5 exempts.

#### When to disable it

```ts
// eslint-disable-next-line repository/no-conditional-write-item-key -- the caller counts the keys to decide whether to write at all
const patch = { ...(name && { name }) };

// eslint-disable-next-line repository/no-conditional-write-item-key -- the raw driver writes an undefined key as null; only a repository drops it
await collection.updateOne(where, { $set: { status, ...(error ? { error } : {}) } });
```

An object whose keys something reads with `Object.keys` or `in` before the write is rule
5's own last exception, and no rule can see it. A write that does not go through a
repository — the raw Mongo driver, or `this.driver.updateOne` — is the other: there is
nothing there to drop an `undefined`, so the guard is load-bearing.

#### What it cannot see

- **An item assembled elsewhere.** `const patch = { ...(cond && { x }) }` followed by
  `item: patch` is the same mistake, and the rule stops at the function boundary rather
  than guess who the object belongs to.
- **A whole-value spread.** `...(overrides ?? {})` merges an object somebody else built, so
  the rule says nothing about which keys it holds.
- **A computed key.** `[marker.charged]` cannot be read, so an ancestor keyed that way ends
  the walk.

### `repository/no-spread-input-into-write-item`

API rule 6. A request takes its joins as id strings, and every one has to be found with
`resolveReferences` under the caller's context before it is written (API rule 2). Spreading
the whole request into the item writes all of them at once, so the ones the handler forgot
go in as the client sent them — and the spread is what hides which those are.

```ts
// bad — every id in the request is written unproved
.mutation(async ({ ctx, input }) => repo.insert({ context, item: { ...input, order } }));

// good — the joins are named, found, and added back
.mutation(async ({ ctx, input }) => {
	const { owner, ...rest } = input;
	const ownerRow = await users.resolveReferences({ context, field: 'owner', ids: owner });

	return repo.insert({ context, item: { ...rest, owner: ownerRow } });
});
```

The remainder is a different binding, so the good shape does not fire. The rule reads the
binding rather than the name — the request is a key picked out of what the handler was
handed, and a rest element never is — so a rest called `input` is still a remainder.

#### When to disable it

```ts
// eslint-disable-next-line repository/no-spread-input-into-write-item -- a category is a name and a description; the request declares no join
await repo.update({ context, item: { ...input.item, _id: input._id } });
```

A request that carries no joins has nothing to destructure. Say that in the reason, so the
next join added to it is a decision somebody makes.

#### What it cannot see

- **A request handed over whole.** `item: input.item` passes the same object without an
  object literal, and the rule is anchored on the spread.
- **A request under another name.** The binding has to be called `input`, which is what
  every router here calls it.
### `repository/no-untyped-where`

Repository rule 10. A where clause is typed `ObjFilter<z.infer<typeof Model>>` over the
whole model, which declares a signature per stored field path — dotted join paths included
— so the filter is checked against what the collection holds. Get out of that check and
the query still compiles and is still valid Mongo; it simply selects no rows, so a sweep
reports zero and a count reads as settled. No test catches it, because the filter the test
writes is the filter the code writes.

```ts
// bad — none of these compares a single key against the model
where: { eventHistory: { $in: ids } } as never
const where = { assignments: { $exists: true } } as Parameters<typeof this.find>[0]['where'];
const where: AnyObject = {};                       // and then `where.status = status`

// good — annotated, or `satisfies`d, over the whole model
const where: ObjFilter<z.infer<typeof Affiliation>> = { 'organization._id': orgId };
where: { 'eventHistory._id': { $in: ids } } satisfies ObjFilter<z.infer<typeof WorkflowRun>>
```

A join is filtered through its model path, operators included: `{ 'roles._id': { $in: ids } }`.
`processWhere` rewrites the dotted key to the stored path — there is no need to cast to a
bare-id filter. A package that does not list `mongo-typed` gets `"mongo-typed": "catalog:"`
in its `dependencies`.

Three shapes are flagged: `ObjFilter` over an inline object type, a cast in a where
position, and a `where`/`*Where` variable annotated as any-keys-at-all and then passed as a
clause. The where position follows the clause as it is assembled — through a `where:` key, a
`where`/`*Where` declarator, a conditional branch, a spread fragment and a `$or`/`$and` arm
— so moving a cast inward does not hide it.

A cast is flagged on either of two grounds. Its type erases the filter outright (`as never`,
`as unknown as …`, `as AnyObject`, or a type derived from a repository signature, including
behind a local alias). Or **its operand is a fresh object literal**, whatever type it names:
the collection is already fixed by the repository the clause is handed to, so naming it
again adds no information, and `as` on a literal only asks for overlap — every key of
`ObjFilter` is optional, so nothing is compared. Annotate the literal or `satisfies` it and
every key is checked.

A cast over a value from OUTSIDE is left to the reviewer, because there is no annotation to
write in its place: `input.where as ObjFilter<PrivateUser>` at a tRPC edge, whose wire type
cannot be an `ObjFilter`. So is a type argument that is a type parameter — `{} as
ObjFilter<T>` in a scope plugin, `{ _id: id } as ObjFilter<z.infer<T>>` in the engine — which
has no model to name but its own parameter.

An ordinary repository or router has no excuse. Three kinds of code do, and each writes the
reason beside the disable:

```ts
// eslint-disable-next-line repository/no-untyped-where -- migration boundary: `approvals` is gone from the model, so nothing types it
const where = { approvals: { $exists: true } } as Parameters<typeof this.find>[0]['where'];

// eslint-disable-next-line repository/no-untyped-where -- the repository is chosen at runtime by namespace, so there is no model to type the filter against
const where: Record<string, unknown> = { _id: input.subject.id };

// eslint-disable-next-line repository/no-untyped-where -- the marker names the covering field at runtime, and a computed key widens the literal to a string index signature the model cannot be checked against
const where = { $or: [{ [`lines.${marker.covered}.id`]: invoice.id }] } as Parameters<typeof this.find>[0]['where'];
```

Where several queries share one dynamic boundary, give it one helper whose RETURN type is
the filter — `openHoursWhere` in the work-orders module — so the boundary is named once and
every caller gets a checked type. Cast the smallest fragment that needs it, not the whole
clause: `openHoursWhere` casts the computed key alone and leaves `'order._id'` checked.

#### What it cannot see

Nothing below is caught, so the rule is a net, not a proof:

- **An escape-hatch PARAMETER or return type.** Rule 10 covers both, and the rule reads
  neither — only a variable's own annotation. `where: object` on a helper's options is
  invisible.
- **A named partial.** `type Where = ObjFilter<{ _id: string }>` is flagged where it is
  DECLARED, being an inline shape, but a cast to `Where` elsewhere is not; only a
  signature-derived alias is followed.
- **A filter variable under another name.** The variable shapes key off `/where$/i`, so a
  clause held in `filter` or `criteria` is nobody's business here.
- **The 141 un-annotated `const where = { … }` sites.** Those ARE checked when passed, so
  flagging them would be noise — but the check is assignability, not a fresh literal's, so
  a stray key in one of them compiles. Tightening that is a separate change.
- **A dotted path the repository rewrites but the model cannot spell**, such as `'name.en'`
  over a localized string union. Those need the boundary named by hand.
- **What a disabled line then costs.** The rule takes a named boundary at its word and says
  nothing about how wide it is. A driver read passing `fields: []` types its filter as
  `ObjFilter<{ _id }>`, so the cast that gets past that covers a typo in ANY path: a
  misspelled one compiles, matches nothing, and a migration silently does nothing. Keep the
  cast on the smallest fragment that needs it.

### `repository/no-model-default`

Repository rule 6. A repository write never parses the model, so a `.default()` on one
does not run on an insert. It runs on whichever request happens to parse the schema and
nowhere else, so whether a row lands with the value depends on the route that wrote it: a
seed, a job or another module stores the row without it. The value belongs in the
repository's `processInsertItem`, where every caller of `insert` gets it.

```ts
// bad — a seed or a job stores a job row with no status
export const ScheduledJob = z.strictObject({
	enabled: z.boolean().default(true),
	status: z.enum(['active', 'failed']).default('active')
});

// good — the storage model requires it, the write model does not, the repository fills it
export const ScheduledJob = z.strictObject({
	enabled: z.boolean(),
	status: z.enum(['active', 'failed'])
});

export const AddScheduledJob = ScheduledJob
	.omit({ _id: true })
	.extend({ enabled: z.boolean().optional(), status: ScheduledJob.shape.status.optional() });
```

A `*Request` declaration is exempt: rule 6 puts request-specific concerns on the request,
and a read request's paging default stores nothing. Where a shape a repository stores is
ALSO parsed on a path that stores nothing — a settings block a policy resolver reads back
— the default does run. Disable the rule on the line and name that parse site.

### `repository/strict-storage-model`

Repository rule 12. `<Model>` is what a stored row holds and it stays strict, so a key the
model does not declare is a parse error rather than a value that disappears. Under
`z.object` it disappears: a caller that misspells a field, or sends one the model dropped
two releases ago, is answered with a successful write that stored neither.

```ts
// bad — an undeclared key is dropped and the write reports success
export const LogEntry = z.object({ _id: objectId, message: z.string() });

// good
export const LogEntry = z.strictObject({ _id: objectId, message: z.string() });
```

It reports a row's own base, including a loose base hiding behind an exported derive —
`const baseVoiceCall = z.object({…})` under `export const VoiceCall = baseVoiceCall.extend(…)`
is a report on `baseVoiceCall`. It does not report the value objects a row nests: a nested
shape often needs its own write form before it can be strict, and where the same element
is also an AI turn's response the shape has to be split first, which is design work rather
than a flip.

**The fix is not cosmetic.** `z.object` strips an unknown key; a strict object throws on
one. Read what parses the model before converting. Where a stored row really does carry a
key the model omits, declare the key — that is what the Mongo validator's own comments
will tell you — rather than leaving the model loose.

### `repository/no-inline-id-ref`

Repository rule 1. A read model declares a join as the joined model, with a `Basic*` type
where that is all the join needs. An inline `z.object({ _id })` partial pins the join to
the fields whoever wrote it needed that day: the next reader who wants a fourth widens the
model instead of asking for a select, and nothing ties the partial to the model it stands
for, so a field renamed on the joined model is renamed nowhere here.

```ts
// bad — a partial of the user row, related to it by nothing
export const UserSession = z.strictObject({
	user: z.object({ _id: z.string(), username: z.string() })
});

// good
export const UserSession = z.strictObject({ user: BasicUser });
```

Rule 2's shape is correct and is not flagged: an `Add`/`Update` model takes a join as a
ref under the same key. A write model is recognised by the base it is named for being
declared in the same file, not by its prefix, so `AddressBook` and `UpdatedByInfo` are not
exempt. Nor is the `idRef` helper a file declares for its own write models. Where the key
is a denormalized snapshot rather than a join — a name captured at send time so a later
rename does not rewrite history — disable the rule on the line and say so.

### What the three model rules can see

They judge a shape by what stores it, not by where it lives. The index starts from the
repositories: every `schema:` a `*-repository.ts` declares is a stored row, and every
shape those rows reach is a stored shape. A `models/` glob was tried first and was wrong
in both directions — it flagged form validators and plugin `settingsSchema`s, which store
nothing, and missed the row models in a `multi-factor/` feature folder.

The index seeds from the OUTERMOST workspace. A nested workspace — an SDK with its own
`pnpm-workspace.yaml` inside a platform repo — would otherwise hide every model whose
repository lives in the outer one, which is exactly the path a per-package lint runs.

Two kinds of shape are held out by name in the index rather than by a directive: a shape
whose contract is a `runStructuredAiTurn` schema, which is deliberately loose so a model
volunteering an extra key is ignored rather than triggering a retry that discards good
output, and `PublicSecretResource`, whose strip is what stops a read surfacing a stored
ciphertext.

A rule reads one file, so cross-file facts are invisible to it. If a suppression only
asserts "this is not really a model", the scope is wrong rather than the site exceptional.

## Adding a rule

One `src/rules/<rule>.ts` built with `ESLintUtils.RuleCreator.withoutDocs`, one
`src/rules/<rule>.spec.ts` beside it driving `RuleTester` through `node:test`. Register the
rule in `rules` in `src/index.ts` and turn it on in `RECOMMENDED` — in the config object
whose `files` scope it needs, adding a new object when no existing scope fits, with a
`name` of `repository/<scope>`. `QUICKSTART` picks the new rule up for free; add nothing
there but a parser. Every entry registers the exported `Plugin` object itself, never a
fresh `{ meta, rules }`: ESLint rejects a second definition of the plugin name unless it is
the same reference. Keep `RECOMMENDED` free of `languageOptions`, so composing it can never
swap a consumer's parser. The rule's doc comment says why the pattern is wrong, not what it
matches.
