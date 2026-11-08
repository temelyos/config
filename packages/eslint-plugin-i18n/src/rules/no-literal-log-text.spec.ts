import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-literal-log-text.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'ts' },
		sourceType: 'module'
	}
});

ruleTester.run('no-literal-log-text', rule as unknown as Rule, {
	invalid: [
		{ code: `AppMessaging.log({ text: 'Saved.' });`, errors: [{ messageId: 'literalText' }] },
		{ code: `AppMessaging.log({ level: 'warn', text: \`Saved.\` });`, errors: [{ messageId: 'literalText' }] },
		{ code: `messageCenter.info({ text: 'Export finished.' });`, errors: [{ messageId: 'literalText' }] },
		{ code: `messageCenter.error({ links, text: 'Could not save {name}.' });`, errors: [{ messageId: 'literalText' }] },
		{ code: `messageCenter.info({ text: \`\${count} saved\` });`, errors: [{ messageId: 'literalText' }] }
	],
	valid: [
		{ code: `AppMessaging.log({ text: result.message });` },
		{ code: `AppMessaging.log({ fallback: 'Saved.', key: 'Saved' });` },
		{ code: `messageCenter.info({ text: \`\${serverText}\` });` },
		{ code: `getLogger().info('worker started', { text: value });` },
		{ code: `render({ text: 'Saved.' });` }
	]
});
