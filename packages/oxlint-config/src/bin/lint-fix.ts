#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, type Hash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// oxlint applies one pass of fixes and skips any that overlap, where ESLint repeats up to ten
// times; run it until the files stop changing, so the fix lands everything ESLint's would.
const MAX_PASSES = 10;
const ARGS = ['--ignore-pattern=**/node_modules/**', '--ignore-pattern=.git/**', ...process.argv.slice(2)];
const skippedDirectories = new Set(['.git', 'dist', 'node_modules']);

function hashSources(directory: string, hash: Hash): Hash {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (skippedDirectories.has(entry.name)) continue;

		const file = path.join(directory, entry.name);

		if (entry.isDirectory()) hashSources(file, hash);
		else hash.update(file).update(fs.readFileSync(file));
	}

	return hash;
}

/** The project's own oxlint, or this package's when the project has none. */
function resolveOxlint(): string {
	for (const from of [path.join(process.cwd(), 'package.json'), import.meta.filename]) {
		try {
			return path.join(path.dirname(createRequire(from).resolve('oxlint/package.json')), 'bin', 'oxlint');
		} catch {
			// not resolvable from here
		}
	}

	throw new Error('temelyos-oxlint-fix: oxlint is not installed');
}

const OXLINT = resolveOxlint();

for (let pass = 0; pass < MAX_PASSES; pass++) {
	const before = hashSources(process.cwd(), createHash('sha1')).digest('hex');

	spawnSync(process.execPath, [OXLINT, ...ARGS, '--fix', '--quiet'], { stdio: 'ignore' });

	if (hashSources(process.cwd(), createHash('sha1')).digest('hex') === before) break;
}

process.exit(spawnSync(process.execPath, [OXLINT, ...ARGS], { stdio: 'inherit' }).status ?? 1);
