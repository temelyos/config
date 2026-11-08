import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-error-message-branching.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'ts' },
		sourceType: 'module'
	}
});

ruleTester.run('no-error-message-branching', rule as unknown as Rule, {
	invalid: [
		{ code: `if (err.message === Errors.Error_UsernameTaken) {}`, errors: [{ messageId: 'branchOnMessage' }] },
		{ code: `if (Errors.Error_UsernameTaken !== err.message) {}`, errors: [{ messageId: 'branchOnMessage' }] },
		{ code: `if (err.message === 'Error_SessionRevoked') {}`, errors: [{ messageId: 'branchOnMessage' }] },
		{ code: `if (errorToString(err) === AuthErrors.Error_AccessDenied) {}`, errors: [{ messageId: 'branchOnMessage' }] },
		{ code: `if (err.message.includes('Error_SessionRevoked')) {}`, errors: [{ messageId: 'branchOnMessage' }] },
		{ code: `if (err.message.startsWith(AmazonErrors.Error_AmazonAccessDenied)) {}`, errors: [{ messageId: 'branchOnMessage' }] },
		{ code: `switch (err.message) { case Errors.Error_A: break; }`, errors: [{ messageId: 'branchOnMessage' }] }
	],
	valid: [
		{ code: `if (errorKeyOf(err) === Errors.Error_UsernameTaken) {}` },
		{ code: `if (err.name === Errors.Error_UsernameTaken) {}` },
		// Comparing an error's text to text, or a key to a key, decides nothing about translation.
		{ code: `if (err.message === 'boom') {}` },
		{ code: `if (result.key === Errors.Error_A) {}` },
		{ code: `if (err.message.includes('timeout')) {}` },
		{ code: `switch (err.message) { case 'boom': break; }` }
	]
});
