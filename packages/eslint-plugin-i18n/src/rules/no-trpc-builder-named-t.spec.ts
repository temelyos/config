import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-trpc-builder-named-t.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'ts' },
		sourceType: 'module'
	}
});

ruleTester.run(
	'no-trpc-builder-named-t',
	rule as unknown as Rule,
	{
		invalid: [
			{ code: `const t = tRpc;`, errors: [{ messageId: 'builderNamedT' }] },
			{ code: `const t = initTRPC.context().meta().create();`, errors: [{ messageId: 'builderNamedT' }] },
			{ code: `export const t = initTRPC.create();`, errors: [{ messageId: 'builderNamedT' }] }
		],
		valid: [
			{ code: `const trpc = tRpc;` },
			{ code: `const trpc = initTRPC.context().meta().create();` },
			{ code: `export function t(key, english) { return key; }` },
			{ code: `const t = makeThing();` },
			{ code: `items.map(t => t.id);` }
		]
	}
);
