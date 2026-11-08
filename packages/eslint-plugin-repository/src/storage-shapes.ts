import fs from 'node:fs';
import path from 'node:path';

/**
 * Which shapes a repository stores.
 *
 * The model rules judge a schema by what writes it, not by which directory it sits in. A
 * `models/` glob is wrong in both directions: it catches a form validator and a plugin
 * `settingsSchema`, neither of which is a stored row, and it misses a whole feature folder
 * of row models — `multi-factor/` holds `ConsumedContinuationToken`, `PasskeyChallenge`
 * and `PendingMultiFactorEnrollment`, none of them under `models/`.
 *
 * So the index starts from the repositories: every `schema:` a `*-repository.ts` declares
 * is a stored row, and every shape those rows reach is a stored shape. That also finds a
 * loose base hiding behind an exported derive, which a rule reading only exported
 * declarations cannot see — `baseVoiceCall` is one.
 */

/** Where a declaration was found, and how it was built. */
interface Declared {
	readonly base: string | undefined,
	readonly file: string,
	readonly isFixture: boolean,
	readonly kind: string,
	readonly refs: readonly string[]
}

/** A repository's options object names its `schema:` beside an `identifier:`. */
const repositoryFile = /repositor(y|ies)/i;

/**
 * An AI turn's options object also spells its contract `schema:`, so a bare `schema:`
 * sweep mistakes a wire contract for a stored row. These names are held out: a structured
 * turn's response shape is deliberately loose, because a model that volunteers an extra
 * key should have it ignored rather than trigger a retry that throws away good output.
 */
const aiTurnSchema = /runStructuredAiTurn\s*\([\s\S]{0,600}?\bschema:\s*([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Held out whatever the graph says. `PublicSecretResource` is non-strict on purpose: the
 * strip is what drops a stored ciphertext so a read can never surface it, even through a
 * select that asks for it. Making it strict turns that silent drop into a thrown read, so
 * this is a named exclusion with its reason rather than a directive someone can delete.
 */
const neverStorage = new Set(['PublicSecretResource']);

const SCAN_ROOTS = ['apps', 'modules', 'packages', 'sdk/packages'];
const skipDirs = new Set(['.git', '.turbo', 'dist', 'node_modules']);
const declStart = /^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=/;
const nextTopLevel = /^(?:export\s+)?(?:async function|class|const|enum|function|interface|let|type|var)\s/;
const repositorySchema = /\bschema:\s*([A-Za-z_][A-Za-z0-9_]*)/g;
const rootMarkers = { repository: '.git', workspace: 'pnpm-workspace.yaml' };

/** `rows` is the base model of a stored row; `shapes` is everything such a model reaches. */
interface Index {
	readonly rows: ReadonlySet<string>,
	readonly shapes: ReadonlySet<string>
}

const cache = new Map<string, Index>();

/** Every shape reachable from a repository's `schema:`, and which of them are row bases. */
function build(root: string): Index {
	// Walk the scan roots themselves, not the whole root filtered afterwards. The root holds
	// far more than the roots do — docs, backups, and on a dev box git worktrees under
	// `.claude/`, which there made the walk 488,073 files to keep 8,875 of — and every
	// lint process builds this index again, once per package. A root that does not exist
	// (the SDK linting itself has no `apps/`) is simply empty.
	const files = SCAN_ROOTS.flatMap(scanRoot => collectFiles(path.join(root, ...scanRoot.split('/')), []));
	const declarations = new Map<string, Declared[]>();
	const seeds = new Set<string>();
	const excluded = new Set(neverStorage);

	for (const file of files) {
		let source: string;

		try {
			source = fs.readFileSync(file, 'utf8');
		} catch {
			continue;
		}

		if (!source.includes('z.') && !source.includes('schema:')) {
			continue;
		}

		const relative = path.relative(root, file).replaceAll('\\', '/');
		const isFixture = /\.(spec|test)\.tsx?$/.test(relative) || /\/(fixtures|testing)\//.test(relative);

		for (const match of source.matchAll(aiTurnSchema)) {
			excluded.add(match[1]!);
		}

		if (repositoryFile.test(relative) && !isFixture) {
			for (const match of source.matchAll(repositorySchema)) {
				seeds.add(match[1]!);
			}
		}

		const lines = source.split('\n');

		for (let index = 0; index < lines.length; index += 1) {
			const start = declStart.exec(lines[index]!);

			if (!start) {
				continue;
			}

			let end = lines.length;

			for (let scan = index + 1; scan < lines.length; scan += 1) {
				if (nextTopLevel.test(lines[scan]!)) {
					end = scan;
					break;
				}
			}

			const { base, kind, refs } = classify(lines.slice(index, end).join('\n'));
			const name = start[1]!;

			if (!declarations.has(name)) {
				declarations.set(name, []);
			}

			declarations.get(name)!.push({ base, file: relative, isFixture, kind, refs });
		}
	}

	// A name declared more than once resolves to the real model over a fixture, so a
	// same-named spec shape cannot stand in for the thing a repository stores.
	const pick = (name: string): Declared | undefined => {
		const all = declarations.get(name);

		return all?.find(entry => !entry.isFixture && entry.file.includes('/models/'))
			?? all?.find(entry => !entry.isFixture)
			?? all?.[0];
	};

	const shapeKinds = new Set(['alias', 'derived', 'discriminatedUnion', 'looseObject', 'object', 'strictObject', 'union']);
	const start = [...seeds].filter(name => !excluded.has(name));

	// A row's BASE is still the row: `VoiceCall` is `baseVoiceCall.extend(…)`, and it is the
	// base that carries the factory a strictness rule reads. Walking only `derived`/`alias`
	// links keeps this to the model itself and out of its fields.
	const rows = new Set<string>();
	const rowQueue = [...start];

	while (rowQueue.length > 0) {
		const name = rowQueue.pop()!;

		if (rows.has(name) || excluded.has(name)) {
			continue;
		}

		const declared = pick(name);

		if (!declared || !shapeKinds.has(declared.kind)) {
			continue;
		}

		rows.add(name);

		if ((declared.kind === 'derived' || declared.kind === 'alias') && declared.base !== undefined && !rows.has(declared.base)) {
			rowQueue.push(declared.base);
		}
	}

	const shapes = new Set<string>();
	const queue = [...start];

	while (queue.length > 0) {
		const name = queue.pop()!;

		if (shapes.has(name) || excluded.has(name)) {
			continue;
		}

		const declared = pick(name);

		if (!declared || !shapeKinds.has(declared.kind)) {
			continue;
		}

		shapes.add(name);

		for (const ref of declared.refs) {
			if (!shapes.has(ref) && !excluded.has(ref)) {
				queue.push(ref);
			}
		}
	}

	for (const name of rows) {
		shapes.add(name);
	}

	return { rows, shapes };
}

/**
 * How a declaration was built, from the text after its `=`. The body is sliced line-wise
 * to the next top-level declaration rather than matched with a lazy regex: under `/m` a
 * `$` anchor ends at the first LINE, which truncates every multi-line shape to its opening
 * call and leaves the walk following almost nothing.
 */
function classify(body: string): { base: string | undefined, kind: string, refs: string[] } {
	const afterEquals = body.slice(body.indexOf('=') + 1);
	let kind = 'other';
	const factory = /z\.(array|boolean|date|discriminatedUnion|enum|lazy|looseObject|number|object|record|strictObject|string|union)\(/.exec(afterEquals);

	if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*\.(and|extend|merge|omit|partial|pick)\(/.test(afterEquals)) {
		kind = 'derived';
	} else if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:\.refine|\.superRefine|;|\s*$)/.test(afterEquals)) {
		kind = 'alias';
	} else if (factory) {
		kind = factory[1]!;
	}

	if (/\.strict\(\)/.test(afterEquals)) {
		kind = 'strictObject';
	}

	// Only the identifier forms a schema is ever named with. Keeping every token would be
	// an order of magnitude more strings held per declaration, for no extra reach, and a
	// monorepo's worth of that is what exhausted the lint process's heap.
	const refs = new Set<string>();

	for (const match of afterEquals.matchAll(/\b([A-Z][A-Za-z0-9_]*|base[A-Z][A-Za-z0-9_]*|[a-z][A-Za-z0-9_]*(?:Fields|Schema|Shape))\b/g)) {
		refs.add(match[1]!);
	}

	return { base: /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(afterEquals)?.[1], kind, refs: [...refs] };
}

/** The index is cached per workspace root for the life of the process; specs clear it. */
export function clearStorageShapeCache(): void {
	cache.clear();
}

function collectFiles(dir: string, out: string[]): string[] {
	let entries: fs.Dirent[];

	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}

	for (const entry of entries) {
		if (skipDirs.has(entry.name)) {
			continue;
		}

		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			collectFiles(full, out);
		} else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
			out.push(full);
		}
	}

	return out;
}

/**
 * The OUTERMOST workspace above `from`, not the nearest.
 *
 * The nearest is wrong wherever a workspace nests inside another: the SDK carries its own
 * `pnpm-workspace.yaml`, so linting an SDK package from the nearest root seeds the index
 * from SDK repositories alone. `HistoryEntry` was then reported, because its repository is
 * in the SDK, while `LogEntry`, `EventHistory`, `MessageHistory` and `FileStorageSettings`
 * were not, because theirs are in the platform — and `turbo run lint` lints SDK packages
 * exactly that way, so the rules were blind in the one path CI runs. A green result for
 * those files was evidence of nothing.
 *
 * `.git` is only a fallback, and only when no workspace file is found at all: a submodule
 * has a `.git` of its own, so preferring it would reintroduce the same boundary.
 */
function findRoot(from: string): string {
	let dir = path.resolve(from);
	let outermostWorkspace: string | undefined;
	let outermostRepository: string | undefined;

	for (;;) {
		if (fs.existsSync(path.join(dir, rootMarkers.workspace))) {
			outermostWorkspace = dir;
		}

		if (fs.existsSync(path.join(dir, rootMarkers.repository))) {
			outermostRepository = dir;
		}

		const parent = path.dirname(dir);

		if (parent === dir) {
			return outermostWorkspace ?? outermostRepository ?? path.resolve(from);
		}

		dir = parent;
	}
}

/**
 * True when `name` is a shape some repository stores, or one such a shape reaches.
 *
 * `known` short-circuits the scan: a rule given an explicit list uses it verbatim, which
 * is how the specs drive these rules without a workspace on disk.
 */
function indexFor(cwd: string): Index {
	const root = findRoot(cwd);
	let index = cache.get(root);

	if (!index) {
		index = build(root);
		cache.set(root, index);
	}

	return index;
}

export function isStorageShape(name: string | undefined, cwd: string, known?: readonly string[]): boolean {
	return lookup(name, cwd, known, 'shapes');
}

/**
 * True when `name` is the base model of a stored row, rather than a value object one of
 * them nests. Strictness lands on the rows first: a nested shape can need its own write
 * form before it can be strict, which is design work rather than a flip.
 */
export function isStoredRow(name: string | undefined, cwd: string, known?: readonly string[]): boolean {
	return lookup(name, cwd, known, 'rows');
}

function lookup(name: string | undefined, cwd: string, known: readonly string[] | undefined, field: 'rows' | 'shapes'): boolean {
	if (name === undefined || neverStorage.has(name)) {
		return false;
	}

	if (known) {
		return known.includes(name);
	}

	return indexFor(cwd)[field].has(name);
}
