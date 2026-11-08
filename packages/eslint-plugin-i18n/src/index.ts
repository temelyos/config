import noErrorMessageBranching from './rules/no-error-message-branching.js';
import noImplicitLocale from './rules/no-implicit-locale.js';
import noLiteralLogText from './rules/no-literal-log-text.js';
import noStaleTranslationMemo from './rules/no-stale-translation-memo.js';
import noTranslateErrorMessage from './rules/no-translate-error-message.js';
import noTrpcBuilderNamedT from './rules/no-trpc-builder-named-t.js';
import noUntranslatedStrings from './rules/no-untranslated-strings.js';
import requireServerErrorStatus from './rules/require-server-error-status.js';

/**
 * Lint plugin exposing Temelyos's i18n lint rules.
 *
 * Consumed by the oxlint configs as a JS plugin:
 *   jsPlugins: [{ name: 'i18n', specifier: '@temelyos/eslint-plugin-i18n' }],
 *   rules: { 'i18n/no-untranslated-strings': 'warn' }
 */
const Plugin = {
	meta: {
		name: '@temelyos/eslint-plugin-i18n',
		version: '1.0.0'
	},
	rules: {
		'no-error-message-branching': noErrorMessageBranching,
		'no-implicit-locale': noImplicitLocale,
		'no-literal-log-text': noLiteralLogText,
		'no-stale-translation-memo': noStaleTranslationMemo,
		'no-translate-error-message': noTranslateErrorMessage,
		'no-trpc-builder-named-t': noTrpcBuilderNamedT,
		'no-untranslated-strings': noUntranslatedStrings,
		'require-server-error-status': requireServerErrorStatus
	}
};

export default Plugin;
