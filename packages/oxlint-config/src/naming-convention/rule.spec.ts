import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import config from '../index.js';
import { namingConvention } from './rule.js';
import { createValidators } from './validator.js';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' }, sourceType: 'module' } });

function temelyosOptions(isJsx: boolean) {
	const override = config.overrides!.find(o => o.files.includes(isJsx ? '**/*.{jsx,tsx}' : '**/*.{js,mjs,cjs,ts,mts}'));
	const [, ...options] = override!.rules!['@temelyos/naming-convention'] as NonNullable<RuleTester.ValidTestCase['options']>;

	return options;
}

const options = temelyosOptions(false);
const jsxOptions = temelyosOptions(true);

describe('@temelyos/naming-convention with the Temelyos options', () => {
	tester.run('naming-convention', namingConvention, {
		valid: [
			{ code: 'export const MAX_ITEMS = 10;', options },
			{ code: 'export const Settings = { a: 1 };', options },
			{ code: 'const LOCAL_FLAG = true;', options },
			{ code: 'function f() { const isReady = 1 > 2; const count = 1; return isReady && count; }', options },
			{ code: 'function f() { const settingsChanged = 1 > 2; return settingsChanged; }', options },
			{ code: 'function f() { const done = 1 > 2; return done; }', options },
			{ code: 'export function doThing() {}', options },
			{ code: 'const handler = () => 1;', options },
			{ code: 'class Widget { private _count = 0; public _id = 1; public name = \'\'; toJSON() { return {}; } }', options },
			{ code: 'type Pair<TItem, T> = [TItem, T];', options },
			{ code: 'export function Card() { return null; }', filename: 'card.tsx', options: jsxOptions },
			{ code: 'export const metadata = {};', filename: 'page.tsx', options: jsxOptions },
			// A type syntax cannot settle passes when some type would let it: typescript-eslint would
			// accept `FOO_BAR` if `getThing` returns a string.
			{ code: 'import { getThing } from \'./thing\'; export const FOO_BAR = getThing();', options },
			{ code: 'import { getThing } from \'./thing\'; function f() { const ready = getThing(); return ready; }', options }
		],
		invalid: [
			{ code: 'export const maxItems = 10;', errors: [{ message: 'Variable name `maxItems` must match one of the following formats: UPPER_CASE' }], options },
			{ code: 'export const settings = { a: 1 };', errors: [{ message: 'Variable name `settings` must match one of the following formats: StrictPascalCase' }], options },
			{ code: 'const ready = 1 > 2;', errors: [{ message: 'Variable name `ready` must match one of the following formats: UPPER_CASE' }], options },
			{ code: 'function f() { const ready = 1 > 2; return ready; }', errors: [{ message: 'Variable name `ready` must have one of the following prefixes: bool, can, did, has, is, should, use, was, will' }], options },
			{ code: 'function f() { const ready = !f; return ready; }', errors: [{ message: 'Variable name `ready` must have one of the following prefixes: bool, can, did, has, is, should, use, was, will' }], options },
			{ code: 'function count(): number { return 1; } const total = count();', errors: [{ message: 'Variable name `total` must match one of the following formats: UPPER_CASE' }], options },
			{ code: 'export function DoThing() {}', errors: [{ message: 'Function name `DoThing` must match one of the following formats: strictCamelCase' }], options },
			{ code: 'class widget {}', errors: [{ message: 'Class name `widget` must match one of the following formats: StrictPascalCase' }], options },
			{ code: 'class Widget { private count = 0; }', errors: [{ message: 'Class Property name `count` must have one leading underscore(s).' }], options },
			{ code: 'class Widget { public _name = 0; }', errors: [{ message: 'Class Property name `_name` must not have a leading underscore.' }], options },
			{ code: 'class Widget { BadMethod() {} }', errors: [{ message: 'Class Method name `BadMethod` must match one of the following formats: strictCamelCase' }], options },
			{ code: 'type Pair<Item> = [Item];', errors: [{ message: 'Type Parameter name `Item` must have one of the following prefixes: T' }], options },
			{ code: 'type Pair<Titem> = [Titem];', errors: [{ message: 'Type Parameter name `Titem` trimmed as `item` must match one of the following formats: StrictPascalCase' }], options },
			// an object can only be assigned to an object type, whatever `Manifest` is
			{ code: 'import type { Manifest } from \'./manifest\'; export const APP_MANIFEST: Manifest = { name: \'x\' };', errors: [{ message: 'Variable name `APP_MANIFEST` must match one of the following formats: StrictPascalCase' }], options },
			// no type would allow `foo_bar`, so the most specific config that surely applies reports it
			{ code: 'import { getThing } from \'./thing\'; export const foo_bar = getThing();', errors: [{ message: 'Variable name `foo_bar` must match one of the following formats: StrictPascalCase' }], options }
		]
	});
});

describe('@temelyos/naming-convention, as typescript-eslint\'s rule', () => {
	tester.run('naming-convention', namingConvention, {
		valid: [
			// typescript-eslint's defaults when no options are given
			'const fooBar = 1; const FOO_BAR = 2; class FooBar {} function fooBar2() {}',
			{ code: 'const { FOO_BAR } = obj;', options: [{ format: ['UPPER_CASE'], modifiers: ['destructured'], selector: 'variable' }, { format: ['camelCase'], selector: 'variable' }] },
			{ code: 'const obj = { \'needs-quotes\': 1 };', options: [{ format: null, modifiers: ['requiresQuotes'], selector: 'objectLiteralProperty' }, { format: ['camelCase'], selector: 'default' }] },
			{ code: 'const foo_bar = 1;', options: [{ custom: { match: true, regex: '_' }, format: null, selector: 'variable' }] },
			{ code: 'enum Color { Red }', options: [{ format: ['PascalCase'], selector: ['enum', 'enumMember'] }] }
		],
		invalid: [
			{ code: 'const FooBar = 1;', errors: [{ message: 'Variable name `FooBar` must match one of the following formats: camelCase, UPPER_CASE' }] },
			{ code: 'const { fooBar } = obj;', errors: [{ message: 'Variable name `fooBar` must match one of the following formats: UPPER_CASE' }], options: [{ format: ['UPPER_CASE'], modifiers: ['destructured'], selector: 'variable' }, { format: ['camelCase'], selector: 'variable' }] },
			// the more specific `variable` selector wins over `default`, whatever the option order
			{ code: 'const fooBar = 1;', errors: [{ message: 'Variable name `fooBar` must match one of the following formats: UPPER_CASE' }], options: [{ format: ['camelCase'], selector: 'default' }, { format: ['UPPER_CASE'], selector: 'variable' }] },
			// a filter outranks modifiers
			{ code: 'export const FOO = 1;', errors: [{ message: 'Variable name `FOO` must match one of the following formats: camelCase' }], options: [{ format: ['UPPER_CASE'], modifiers: ['exported'], selector: 'variable' }, { filter: '^F', format: ['camelCase'], selector: 'variable' }] },
			{ code: 'const _foo = 1;', errors: [{ message: 'Variable name `_foo` must have two leading underscore(s).' }], options: [{ format: ['camelCase'], leadingUnderscore: 'requireDouble', selector: 'variable' }] },
			{ code: 'const foo = 1;', errors: [{ message: 'Variable name `foo` must match the RegExp: /_/u' }], options: [{ custom: { match: true, regex: '_' }, format: null, selector: 'variable' }] },
			{ code: 'const obj = { \'needs-quotes\': 1 };', errors: [{ message: 'Object Literal Property name `needs-quotes` must match one of the following formats: camelCase' }], options: [{ format: ['camelCase'], selector: 'objectLiteralProperty' }] },
			{ code: 'enum Color { red }', errors: [{ message: 'Enum Member name `red` must match one of the following formats: PascalCase' }], options: [{ format: ['PascalCase'], selector: 'enumMember' }] },
			{ code: 'interface Foo { bar_baz(): void }', errors: [{ message: 'Type Method name `bar_baz` must match one of the following formats: camelCase' }], options: [{ format: ['camelCase'], selector: 'typeMethod' }] },
			{ code: 'class Foo { constructor(private readonly bar_baz: string) {} }', errors: [{ message: 'Parameter Property name `bar_baz` must match one of the following formats: camelCase' }], options: [{ format: ['camelCase'], modifiers: ['private', 'readonly'], selector: 'parameterProperty' }] },
			{ code: 'function f(foo_bar: string) {}', errors: [{ message: 'Parameter name `foo_bar` must match one of the following formats: camelCase' }], options: [{ format: ['camelCase'], selector: 'parameter' }] }
		]
	});
});

describe('@temelyos/naming-convention options', () => {
	it('rejects names typescript-eslint does not define', () => {
		const create = (option: object) => () => createValidators({} as never, [{ format: null, selector: 'variable', ...option }] as never);

		assert.throws(create({ selector: 'constant' }), /unknown selector "constant"/);
		assert.throws(create({ modifiers: ['exportd'] }), /unknown modifier "exportd"/);
		assert.throws(create({ format: ['kebab-case'] }), /unknown format "kebab-case"/);
	});
});
