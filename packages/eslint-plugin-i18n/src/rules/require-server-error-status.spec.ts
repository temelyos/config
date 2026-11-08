import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './require-server-error-status.js';

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
	'require-server-error-status',
	// Authored with typescript-eslint's RuleModule; oxlint's RuleTester expects
	// its own structurally-equivalent Rule.
	rule as unknown as Rule,
	{
		invalid: [
			{
				code: `throw new ServerError(Errors.Error_NotFound);`,
				errors: [{ messageId: 'missingStatus' }]
			},
			// Single-arg key from a namespaced registry alias
			{
				code: `throw new ServerError(FrameworkErrors.Error_UnableToLoadSettings);`,
				errors: [{ messageId: 'missingStatus' }]
			},
			// Computed-member key (e.g. mongo/sql datasource registries)
			{
				code: `throw new ServerError(Errors['mongo:blocked-host']);`,
				errors: [{ messageId: 'missingStatus' }]
			},
			// Constructed and handed to a callback rather than thrown
			{
				code: `callback(new ServerError(AuthenticationErrors.Error_AccessDenied));`,
				errors: [{ messageId: 'missingStatus' }]
			},
			// Key-first with extra args: the key still lands in `message` (and the
			// second arg becomes `name`) — doubly broken, must also be flagged
			{
				code: `throw new ServerError(Errors.Error_SlackApiError, 'users.lookupByEmail failed');`,
				errors: [{ messageId: 'missingStatus' }]
			},
			{
				code: `throw new ServerError(Errors.Error_X, undefined, undefined, { detail });`,
				errors: [{ messageId: 'missingStatus' }]
			}
		],

		valid: [
			// Correct two-arg form: status first, key second
			{ code: `throw new ServerError(404, Errors.Error_NotFound);` },
			{ code: `throw new ServerError(500, Errors.Error_X, undefined, undefined, { id });` },
			// Legitimate single-string-message shorthand
			{ code: `throw new ServerError('something broke');` },
			{ code: `throw new ServerError();` },
			// A non-registry single argument (not a *Errors member) is left alone
			{ code: `throw new ServerError(message);` },
			{ code: `throw new OtherError(Errors.Error_NotFound);` }
		]
	}
);
