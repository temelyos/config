import type { Linter } from 'eslint';

import eslintjs from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import perfectionist from 'eslint-plugin-perfectionist';
import globals from 'globals';
import tseslint from 'typescript-eslint';

function createNamingConventions(isJsx: boolean) {
	return [
		'error',
		{
			'format': isJsx ? ['strictCamelCase', 'StrictPascalCase'] : ['strictCamelCase'],
			'modifiers': ['exported'],
			'selector': ['function']
		},
		{
			'filter': {
				'match': false,
				'regex': '^_$'
			},
			'format': ['UPPER_CASE'],
			'modifiers': ['exported'],
			'selector': ['variable'],
			'types': ['array', 'boolean', 'number', 'string']
		},
		{
			'filter': {
				'match': false,
				'regex': '^_$'
			},
			'format': ['UPPER_CASE'],
			'modifiers': ['global', 'const'],
			'selector': ['variable'],
			'types': ['array', 'boolean', 'number', 'string']
		},
		{
			'filter': {
				'match': false,
				'regex': isJsx ? '^_|(metadata)$' : '^_$'
			},
			'format': ['StrictPascalCase'],
			'modifiers': ['exported'],
			'selector': ['variable']
		},
		{
			'filter': {
				'match': false,
				'regex': '^_$'
			},
			'format': isJsx ? ['strictCamelCase', 'StrictPascalCase'] : ['strictCamelCase'],
			'modifiers': ['global'],
			'selector': ['variable'],
			'types': ['function']
		},
		{
			'filter': {
				'match': false,
				'regex': '^(changed|done|found|result|retry|waiting|(.+)Changed|(.+)Updated)$'
			},
			'format': null,
			'prefix': ['bool', 'can', 'did', 'has', 'is', 'should', 'use', 'was', 'will'],
			'selector': 'variable',
			'types': ['boolean']
		},
		{
			'filter': {
				'match': true,
				'regex': '^((.+)Changed|(.+)Updated)$'
			},
			'format': ['strictCamelCase'],
			'selector': 'variable',
			'suffix': ['Changed', 'Updated'],
			'types': ['boolean']
		},
		{
			'filter': {
				'match': false,
				'regex': '^_(id)?$'
			},
			'format': isJsx ? ['strictCamelCase', 'StrictPascalCase'] : ['strictCamelCase'],
			'selector': 'variable'
		},
		{
			format: ['StrictPascalCase'],
			selector: ['class', 'enum', 'interface', 'typeAlias']
		},
		{
			filter: {
				match: false,
				regex: '^(T|U|V)$'
			},
			format: ['StrictPascalCase'],
			prefix: ['T'],
			selector: 'typeParameter'
		},
		{
			format: ['strictCamelCase'],
			leadingUnderscore: 'require',
			modifiers: ['private'],
			selector: 'classProperty'
		},
		{
			filter: {
				match: false,
				regex: '^(_id)$'
			},
			format: ['strictCamelCase'],
			leadingUnderscore: 'forbid',
			modifiers: ['public'],
			selector: 'classProperty'
		},
		{
			filter: {
				match: false,
				regex: '^(toJSON)$'
			},
			format: ['strictCamelCase'],
			selector: 'classMethod'
		}
	];
}

export default {
	configs: {
		flat: [
			{
				files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
				languageOptions: {
					globals: globals.node,
					parser: tsParser,
					parserOptions: {
						ecmaFeatures: { jsx: true },
						projectService: true,
						tsconfigRootDir: import.meta.dirname
					}
				}
			},
			eslintjs.configs.recommended,
			stylistic.configs['recommended'],
			perfectionist.configs['recommended-natural'],
			...tseslint.configs.recommended,
			{
				files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
				plugins: {
					import: importPlugin
				},
				rules: {
					'@stylistic/block-spacing': 'error',
					'@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
					'@stylistic/comma-dangle': ['error', 'never'],
					'@stylistic/comma-spacing': ['error', { after: true, before: false }],
					'@stylistic/dot-location': ['error', 'property'],
					'@stylistic/function-call-spacing': ['error', 'never'],
					'@stylistic/indent': [
						'error',
						'tab',
						{
							ignoredNodes: ['ConditionalExpression'],
							SwitchCase: 1
						}
					],
					'@stylistic/indent-binary-ops': ['error', 'tab'],
					'@stylistic/member-delimiter-style': [
						'error',
						{
							multiline: {
								delimiter: 'comma',
								requireLast: false
							},
							singleline: {
								delimiter: 'comma',
								requireLast: false
							}
						}
					],
					'@stylistic/no-extra-semi': 'off',
					'@stylistic/no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
					'@stylistic/no-tabs': ['error', { allowIndentationTabs: true }],
					'@stylistic/no-trailing-spaces': 'error',
					'@stylistic/no-whitespace-before-property': 'error',
					'@stylistic/operator-linebreak': ['error', 'before', { 'overrides': { '+=': 'after', '-=': 'after', '=': 'after' } }],
					'@stylistic/quote-props': ['error', 'consistent'],
					'@stylistic/quotes': ['error', 'single', { allowTemplateLiterals: 'always', avoidEscape: true }],
					'@stylistic/semi': ['error', 'always'],
					'@stylistic/semi-spacing': 'error',
					'@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
					'@typescript-eslint/no-explicit-any': ['off'],
					'@typescript-eslint/no-restricted-types': 'warn',
					'@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: 'only-allowed-literals' }],
					'@typescript-eslint/no-unused-vars': [
						'error',
						{
							argsIgnorePattern: '^_',
							caughtErrors: 'none',

							caughtErrorsIgnorePattern: '^_',
							ignoreRestSiblings: true,
							varsIgnorePattern: '^_'
						}
					],
					'import/no-duplicates': 'error',
					'no-debugger': 'warn',
					'no-empty': ['error', { 'allowEmptyCatch': true }],
					'no-empty-pattern': ['error', { 'allowObjectPatternsAsParameters': true }],
					'no-throw-literal': 'error',
					'perfectionist/sort-classes': [
						'error',
						{
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
							],
							order: 'asc',
							type: 'natural'
						}
					],
					'perfectionist/sort-intersection-types': 'off',
					'perfectionist/sort-modules': [
						'error',
						{
							groups: [
								'declare-enum',
								'declare-function',
								['declare-class', 'declare-interface', 'declare-type'],
								['export-enum', 'enum'],
								['export-interface', 'export-type', 'interface', 'type'],
								['export-function', 'function'],
								['class', 'export-class']
							],
							order: 'asc',
							type: 'natural'
						}
					],
					'prefer-const': ['error', { destructuring: 'all' }],
					'prefer-rest-params': 'off'
				}
			},
			{
				files: ['**/*.{js,mjs,cjs,ts,mts}'],
				rules: {
					'@typescript-eslint/naming-convention': createNamingConventions(false)
				}
			},
			{
				files: ['**/*.{jsx,tsx}'],
				rules: {
					'@stylistic/jsx-indent-props': ['error', 'tab'],
					'@typescript-eslint/naming-convention': createNamingConventions(true)
				}
			}
		] as Linter.Config
	}
};
