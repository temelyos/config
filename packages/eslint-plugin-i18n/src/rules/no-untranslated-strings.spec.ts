import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-untranslated-strings.js';

// ESLint's RuleTester drives its cases through describe()/it() hooks. Point them
// at node:test so each valid/invalid case becomes a real subtest under the runner.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'tsx' },
		sourceType: 'module'
	}
});

ruleTester.run(
	'no-untranslated-strings',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			{
				code: `<div>Hello world</div>`,
				errors: [{ data: { text: 'Hello world' }, messageId: 'untranslated' }]
			},
			{
				code: `<input placeholder="Search accounts" />`,
				errors: [{ data: { text: 'Search accounts' }, messageId: 'untranslated' }]
			},
			{
				code: `<Field label="First name" />`,
				errors: [{ data: { text: 'First name' }, messageId: 'untranslated' }]
			},
			{
				code: `<Section title="User settings" />`,
				errors: [{ data: { text: 'User settings' }, messageId: 'untranslated' }]
			},
			{
				code: `<button aria-label="Close dialog" />`,
				errors: [{ data: { text: 'Close dialog' }, messageId: 'untranslated' }]
			},
			{
				code: `<Field description="Enter your full name" />`,
				errors: [{ data: { text: 'Enter your full name' }, messageId: 'untranslated' }]
			},
			{
				code: `<img alt="Profile photo" />`,
				errors: [{ data: { text: 'Profile photo' }, messageId: 'untranslated' }]
			},
			{
				code: `<Icon tooltip="Delete item" />`,
				errors: [{ data: { text: 'Delete item' }, messageId: 'untranslated' }]
			},
			{
				code: `<Page heading="Account overview" />`,
				errors: [{ data: { text: 'Account overview' }, messageId: 'untranslated' }]
			},
			{
				code: `<p>Save your changes before leaving</p>`,
				errors: [
					{ data: { text: 'Save your changes before leaving' }, messageId: 'untranslated' }
				]
			},
			// Custom attribute set provided — custom attr IS flagged
			{
				code: `<input myLabel="Do something" />`,
				errors: [{ data: { text: 'Do something' }, messageId: 'untranslated' }],
				options: [{ attributes: ['myLabel'] }]
			}
		],

		valid: [
			{ code: `<div>{t('Greeting', 'Hello')}</div>` },
			// className is not in the flagged attribute set
			{ code: `<input className="p-4" />` },
			{ code: `<input placeholder={t('Search', 'Search')} />` },
			{ code: `<a href="/x">{t('Home', 'Home')}</a>` },
			// JSXText that is only whitespace/punctuation (no two-letter run)
			{ code: `<div> — </div>` },
			// Allowlisted string via built-in allowlist
			{ code: `<Button label="OK" />` },
			// Non-flagged attribute with a literal (id is not in the default set)
			{ code: `<div id="main" />` },
			// Single letter glyph – not two letters
			{ code: `<div>×</div>` },
			{ code: `<div>   </div>` },
			{ code: `<input type="text" />` },
			{ code: `<li key="item-1" />` },
			{ code: `<div data-testid="submit-btn" />` },
			{ code: `<input value="something" />` },
			// custom allow list via options
			{
				code: `<Field label="Custom allowlisted" />`,
				options: [{ allow: ['Custom allowlisted'] }]
			},
			// custom attribute set (does not include label) — so label is not flagged
			{
				code: `<Field label="First name" />`,
				options: [{ attributes: ['placeholder'] }]
			},
			{ code: `<div>: </div>` },
			{ code: `<div>42</div>` }
		]
	}
);
