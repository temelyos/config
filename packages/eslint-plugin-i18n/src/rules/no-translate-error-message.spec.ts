import type { Rule } from '@oxlint/plugins';

import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

import rule from './no-translate-error-message.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: { lang: 'ts' },
		sourceType: 'module'
	}
});

const DECLARE_T = 'declare function t(key: string, fallback?: string): string;';

ruleTester.run('no-translate-error-message', rule as unknown as Rule, {
	invalid: [
		{ code: `${DECLARE_T} declare const err: Error; t(err.message, 'Failed');`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} declare const err: unknown; if (err instanceof Error) t(err.message, err.message);`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} class ApiError extends Error { key?: string } declare const err: ApiError; t(err.message);`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} declare const err: Error | undefined; t(err!.message);`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} declare const err: Error | undefined; t(err?.message);`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} function render(err: TRPCClientError) { return t(err.message); }`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} const err = new ServerError('x'); t(err.message);`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} declare const err: unknown; const text = err instanceof ApiError ? t(err.message) : '';`, errors: [{ messageId: 'translatedMessage' }] },
		{ code: `${DECLARE_T} declare const err: unknown; const text = err instanceof Error && t(err.message);`, errors: [{ messageId: 'translatedMessage' }] }
	],
	valid: [
		// A validation result's `message` is a key: translating it is right.
		{ code: `${DECLARE_T} declare const result: { message: string }; t(result.message, result.message);` },
		{ code: `${DECLARE_T} declare const issue: { message: string, path: string }; t(issue.message);` },
		{ code: `${DECLARE_T} declare const err: Error; t('SaveFailed', err.message);` },
		{ code: `${DECLARE_T} declare const err: unknown; if (err instanceof Error) {} else t(err.message);` },
		{ code: `${DECLARE_T} declare const err: unknown; if (other instanceof Error) t(err.message);` },
		{ code: `${DECLARE_T} declare const err: ErrorDetails; t(err.message);` }
	]
});
