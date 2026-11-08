import noConditionalWriteItemKey from './rules/no-conditional-write-item-key.js';
import noInlineIdRef from './rules/no-inline-id-ref.js';
import noModelDefault from './rules/no-model-default.js';
import noParallelTransactionStart from './rules/no-parallel-transaction-start.js';
import noSpreadInputIntoWriteItem from './rules/no-spread-input-into-write-item.js';
import noUntypedWhere from './rules/no-untyped-where.js';
import strictStorageModel from './rules/strict-storage-model.js';

/**
 * Lint plugin exposing Temelyos's repository and API rules (docs/repository-and-api-rules.md).
 *
 * The oxlint configs load it as a JS plugin and scope each rule alongside their own globs:
 *   jsPlugins: [{ name: 'repository', specifier: '@temelyos/eslint-plugin-repository' }],
 *   rules: { 'repository/no-untyped-where': 'error' }
 */
const Plugin = {
	meta: {
		name: '@temelyos/eslint-plugin-repository',
		version: '1.0.0'
	},
	rules: {
		'no-conditional-write-item-key': noConditionalWriteItemKey,
		'no-inline-id-ref': noInlineIdRef,
		'no-model-default': noModelDefault,
		'no-parallel-transaction-start': noParallelTransactionStart,
		'no-spread-input-into-write-item': noSpreadInputIntoWriteItem,
		'no-untyped-where': noUntypedWhere,
		'strict-storage-model': strictStorageModel
	}
};

export default Plugin;
