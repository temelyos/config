import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-implicit-locale.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'ts' },
		sourceType: 'module'
	}
});

ruleTester.run('no-implicit-locale', rule as unknown as Rule, {
	invalid: [
		{ code: `date.toLocaleString();`, errors: [{ messageId: 'implicitLocale' }] },
		{ code: `date.toLocaleDateString(undefined, { month: 'long' });`, errors: [{ messageId: 'implicitLocale' }] },
		{ code: `amount.toLocaleString([]);`, errors: [{ messageId: 'implicitLocale' }] },
		{ code: `date.toLocaleTimeString();`, errors: [{ messageId: 'implicitLocale' }] },
		{ code: `new Intl.NumberFormat();`, errors: [{ messageId: 'implicitLocale' }] },
		{ code: `new Intl.DateTimeFormat(undefined, { dateStyle: 'short' });`, errors: [{ messageId: 'implicitLocale' }] },
		{ code: `Intl.PluralRules([]);`, errors: [{ messageId: 'implicitLocale' }] },
		{ code: `new Intl.RelativeTimeFormat();`, errors: [{ messageId: 'implicitLocale' }] }
	],
	valid: [
		{ code: `date.toLocaleString(locale);` },
		{ code: `date.toLocaleDateString('en-US', { month: 'long' });` },
		{ code: `new Intl.NumberFormat(locale, { style: 'currency', currency });` },
		{ code: `new Intl.DateTimeFormat([locale]);` },
		{ code: `new Intl.Locale();` },
		{ code: `date.toISOString();` },
		{ code: `formatter.format();` }
	]
});
