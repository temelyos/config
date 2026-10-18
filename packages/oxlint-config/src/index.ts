import type { OxlintConfig } from 'oxlint';

import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import { fileURLToPath } from 'node:url';

type Rules = NonNullable<OxlintConfig['rules']>;

// A consumer passes this object to `extends`, so oxlint has no file of ours to resolve plugin
// specifiers against. Resolving them here finds the copies this package depends on.
function resolvePlugin(specifier: string) {
	return fileURLToPath(import.meta.resolve(specifier));
}

/** ESLint's and typescript-eslint's recommended rules, under oxlint's names. */
const recommended: Rules = {
	'constructor-super': 'error',
	'for-direction': 'error',
	'getter-return': 'error',
	'no-array-constructor': 'error',
	'no-async-promise-executor': 'error',
	'no-case-declarations': 'error',
	'no-class-assign': 'error',
	'no-compare-neg-zero': 'error',
	'no-cond-assign': 'error',
	'no-const-assign': 'error',
	'no-constant-binary-expression': 'error',
	'no-constant-condition': 'error',
	'no-control-regex': 'error',
	'no-debugger': 'error',
	'no-delete-var': 'error',
	'no-dupe-class-members': 'error',
	'no-dupe-else-if': 'error',
	'no-dupe-keys': 'error',
	'no-duplicate-case': 'error',
	'no-empty': 'error',
	'no-empty-character-class': 'error',
	'no-empty-pattern': 'error',
	'no-empty-static-block': 'error',
	'no-ex-assign': 'error',
	'no-extra-boolean-cast': 'error',
	'no-fallthrough': 'error',
	'no-func-assign': 'error',
	'no-global-assign': 'error',
	'no-import-assign': 'error',
	'no-invalid-regexp': 'error',
	'no-irregular-whitespace': 'error',
	'no-loss-of-precision': 'error',
	'no-misleading-character-class': 'error',
	'no-new-native-nonconstructor': 'error',
	'no-nonoctal-decimal-escape': 'error',
	'no-obj-calls': 'error',
	'no-prototype-builtins': 'error',
	'no-redeclare': 'error',
	'no-regex-spaces': 'error',
	'no-self-assign': 'error',
	'no-setter-return': 'error',
	'no-shadow-restricted-names': 'error',
	'no-sparse-arrays': 'error',
	'no-this-before-super': 'error',
	'no-undef': 'error',
	'no-unexpected-multiline': 'error',
	'no-unreachable': 'error',
	'no-unsafe-finally': 'error',
	'no-unsafe-negation': 'error',
	'no-unsafe-optional-chaining': 'error',
	'no-unused-expressions': 'error',
	'no-unused-labels': 'error',
	'no-unused-private-class-members': 'error',
	'no-unused-vars': 'error',
	'no-useless-backreference': 'error',
	'no-useless-catch': 'error',
	'no-useless-escape': 'error',
	'no-with': 'error',
	'require-yield': 'error',
	'typescript/ban-ts-comment': 'error',
	'typescript/no-duplicate-enum-values': 'error',
	'typescript/no-empty-object-type': 'error',
	'typescript/no-explicit-any': 'error',
	'typescript/no-extra-non-null-assertion': 'error',
	'typescript/no-misused-new': 'error',
	'typescript/no-namespace': 'error',
	'typescript/no-non-null-asserted-optional-chain': 'error',
	'typescript/no-require-imports': 'error',
	'typescript/no-this-alias': 'error',
	'typescript/no-unnecessary-type-constraint': 'error',
	'typescript/no-unsafe-declaration-merging': 'error',
	'typescript/no-unsafe-function-type': 'error',
	'typescript/no-wrapper-object-types': 'error',
	'typescript/prefer-as-const': 'error',
	'typescript/prefer-namespace-keyword': 'error',
	'typescript/triple-slash-reference': 'error',
	'use-isnan': 'error',
	'valid-typeof': 'error'
};

/** typescript-eslint's `eslint-recommended`: off where the compiler already reports it. */
const typeScriptChecked: Rules = {
	'constructor-super': 'off',
	'getter-return': 'off',
	'no-class-assign': 'off',
	'no-const-assign': 'off',
	'no-dupe-class-members': 'off',
	'no-dupe-keys': 'off',
	'no-func-assign': 'off',
	'no-import-assign': 'off',
	'no-new-native-nonconstructor': 'off',
	'no-obj-calls': 'off',
	'no-redeclare': 'off',
	'no-setter-return': 'off',
	'no-this-before-super': 'off',
	'no-undef': 'off',
	'no-unreachable': 'off',
	'no-unsafe-negation': 'off',
	'no-var': 'error',
	'no-with': 'off',
	'prefer-const': 'error',
	'prefer-rest-params': 'error',
	'prefer-spread': 'error'
};

/** `@temelyos/naming-convention` options, as `@temelyos/eslint-config` passes them to typescript-eslint's rule. */
function createNamingConventions(isJsx: boolean) {
	return [
		'error',
		{
			selector: ['function'],
			modifiers: ['exported'],
			format: isJsx ? ['strictCamelCase', 'StrictPascalCase'] : ['strictCamelCase']
		},
		{
			selector: ['variable'],
			types: ['array', 'boolean', 'number', 'string'],
			modifiers: ['exported'],
			format: ['UPPER_CASE'],
			filter: { regex: '^_$', match: false }
		},
		{
			selector: ['variable'],
			types: ['array', 'boolean', 'number', 'string'],
			modifiers: ['global', 'const'],
			format: ['UPPER_CASE'],
			filter: { regex: '^_$', match: false }
		},
		{
			selector: ['variable'],
			modifiers: ['exported'],
			format: ['StrictPascalCase'],
			filter: { regex: isJsx ? '^_|(metadata)$' : '^_$', match: false }
		},
		{
			selector: ['variable'],
			modifiers: ['global'],
			types: ['function'],
			format: isJsx ? ['strictCamelCase', 'StrictPascalCase'] : ['strictCamelCase'],
			filter: { regex: '^_$', match: false }
		},
		{
			selector: 'variable',
			types: ['boolean'],
			format: null,
			filter: { regex: '^(changed|done|found|result|retry|waiting|(.+)Changed|(.+)Updated)$', match: false },
			prefix: ['bool', 'can', 'did', 'has', 'is', 'should', 'use', 'was', 'will']
		},
		{
			selector: 'variable',
			types: ['boolean'],
			format: ['strictCamelCase'],
			filter: { regex: '^((.+)Changed|(.+)Updated)$', match: true },
			suffix: ['Changed', 'Updated']
		},
		{
			selector: 'variable',
			format: isJsx ? ['strictCamelCase', 'StrictPascalCase'] : ['strictCamelCase'],
			filter: { regex: '^_(id)?$', match: false }
		},
		{
			selector: ['class', 'enum', 'interface', 'typeAlias'],
			format: ['StrictPascalCase']
		},
		{
			selector: 'typeParameter',
			format: ['StrictPascalCase'],
			filter: { regex: '^(T|U|V)$', match: false },
			prefix: ['T']
		},
		{
			selector: 'classProperty',
			modifiers: ['private'],
			leadingUnderscore: 'require',
			format: ['strictCamelCase']
		},
		{
			selector: 'classProperty',
			modifiers: ['public'],
			leadingUnderscore: 'forbid',
			filter: { regex: '^(_id)$', match: false },
			format: ['strictCamelCase']
		},
		{
			selector: 'classMethod',
			filter: { regex: '^(toJSON)$', match: false },
			format: ['strictCamelCase']
		}
	] as Rules[string];
}

/**
 * The Temelyos rules, kept in the same order as `@temelyos/eslint-config` so the two diff cleanly.
 * `typescript/no-unnecessary-condition` needs the consumer's root config to set `options.typeAware`.
 */
const temelyos: Rules = {
	'import/no-duplicates': 'error',
	'no-debugger': 'warn',
	'no-empty': ['error', { allowEmptyCatch: true }],
	'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
	'no-throw-literal': 'error',
	'prefer-const': ['error', { destructuring: 'all' }],
	'prefer-rest-params': 'off',
	'perfectionist/sort-classes': [
		'error',
		{
			order: 'asc',
			type: 'natural',
			groups: [
				'index-signature',
				'static-property',
				'static-block',
				['protected-property', 'protected-accessor-property'],
				['private-property', 'private-accessor-property'],
				['property', 'accessor-property'],
				'constructor',
				['static-method', 'protected-method', 'private-method', 'method', 'get-method', 'set-method'],
				'unknown'
			]
		}
	],
	'perfectionist/sort-modules': [
		'error',
		{
			order: 'asc',
			type: 'natural',
			groups: [
				'declare-enum',
				'declare-function',
				['declare-class', 'declare-interface', 'declare-type'],
				['export-enum', 'enum'],
				['export-interface', 'export-type', 'interface', 'type'],
				['export-function', 'function'],
				['class', 'export-class']
			]
		}
	],
	'perfectionist/sort-intersection-types': 'off',
	'@stylistic/block-spacing': 'error',
	'@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
	'@stylistic/comma-dangle': ['error', 'never'],
	'@stylistic/comma-spacing': ['error', { before: false, after: true }],
	'@stylistic/dot-location': ['error', 'property'],
	'@stylistic/function-call-spacing': ['error', 'never'],
	'@stylistic/indent': ['error', 'tab', { ignoredNodes: ['ConditionalExpression'], SwitchCase: 1 }],
	'@stylistic/indent-binary-ops': ['error', 'tab'],
	'@stylistic/operator-linebreak': ['error', 'before', { overrides: { '=': 'after', '+=': 'after', '-=': 'after' } }],
	'@stylistic/member-delimiter-style': [
		'error',
		{
			multiline: { delimiter: 'comma', requireLast: false },
			singleline: { delimiter: 'comma', requireLast: false }
		}
	],
	'@stylistic/no-extra-semi': 'off',
	'@stylistic/no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
	'@stylistic/no-tabs': ['error', { allowIndentationTabs: true }],
	'@stylistic/no-trailing-spaces': 'error',
	'@stylistic/no-whitespace-before-property': 'error',
	'@stylistic/quote-props': ['error', 'consistent'],
	'@stylistic/quotes': ['error', 'single', { allowTemplateLiterals: 'always', avoidEscape: true }],
	'@stylistic/semi-spacing': 'error',
	'@stylistic/semi': ['error', 'always'],
	'typescript/consistent-type-definitions': ['error', 'interface'],
	'typescript/no-explicit-any': 'off',
	'typescript/no-restricted-types': 'warn',
	'no-unused-vars': [
		'error',
		{
			caughtErrors: 'none',
			ignoreRestSiblings: true,
			varsIgnorePattern: '^_',
			argsIgnorePattern: '^_',
			caughtErrorsIgnorePattern: '^_'
		}
	],
	'typescript/no-unnecessary-condition': ['error', { allowConstantLoopConditions: 'only-allowed-literals' }]
};

const config: OxlintConfig = {
	categories: { correctness: 'off' },
	env: { builtin: true },
	jsPlugins: [
		{ name: '@stylistic', specifier: resolvePlugin('@stylistic/eslint-plugin') },
		{ name: '@temelyos', specifier: resolvePlugin('./plugin.js') },
		{ name: 'perfectionist', specifier: resolvePlugin('eslint-plugin-perfectionist') }
	],
	plugins: ['typescript', 'import'],
	rules: {
		...recommended,
		...stylistic.configs.recommended.rules as Rules,
		...perfectionist.configs['recommended-natural'].rules as Rules
	},
	// Order matters as it does in the ESLint config: the Temelyos rules come after
	// `typeScriptChecked`, so their `prefer-const` and `prefer-rest-params` win on TypeScript files.
	overrides: [
		{
			files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
			rules: typeScriptChecked
		},
		{
			files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
			env: { node: true },
			rules: temelyos
		},
		{
			files: ['**/*.{js,mjs,cjs,ts,mts}'],
			rules: { '@temelyos/naming-convention': createNamingConventions(false) }
		},
		{
			files: ['**/*.{jsx,tsx}'],
			rules: {
				'@stylistic/jsx-indent-props': ['error', 'tab'],
				'@temelyos/naming-convention': createNamingConventions(true)
			}
		}
	]
};

export default config;
