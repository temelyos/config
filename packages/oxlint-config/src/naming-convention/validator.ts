import type { Context } from '@oxlint/plugins';

import type { AstNode } from './ast.js';
import type { TypeKind } from './infer-type.js';

import {
	isMetaSelector,
	isMethodOrPropertySelector,
	META_SELECTORS,
	type MetaSelectorName,
	MODIFIERS,
	type ModifierName,
	SELECTORS,
	SELECTORS_ALLOWED_TO_HAVE_TYPES,
	type SelectorName,
	TYPE_MODIFIERS,
	type TypeModifierName,
	UNDERSCORE_OPTIONS,
	type UnderscoreOption
} from './enums.js';
import { FORMAT_CHECKS, type FormatName } from './format.js';

interface MatchRegex {
	match: boolean,
	regex: string
}

/** One entry of the rule's options, in typescript-eslint's schema. */
export interface NamingOption {
	custom?: MatchRegex,
	filter?: MatchRegex | string,
	format: FormatName[] | null,
	leadingUnderscore?: UnderscoreOption,
	modifiers?: ModifierName[],
	prefix?: string[],
	selector: (MetaSelectorName | SelectorName) | (MetaSelectorName | SelectorName)[],
	suffix?: string[],
	trailingUnderscore?: UnderscoreOption,
	types?: TypeModifierName[]
}

interface NormalizedOption {
	custom: { match: boolean, regex: RegExp } | null,
	filter: { match: boolean, regex: RegExp } | null,
	format: FormatName[] | null,
	leadingUnderscore: UnderscoreOption | null,
	modifiers: number[] | null,
	modifierWeight: number,
	prefix: string[] | null,
	selector: number,
	suffix: string[] | null,
	trailingUnderscore: UnderscoreOption | null,
	types: TypeModifierName[] | null
}

interface Failure {
	data: Record<string, string | undefined>,
	messageId: string
}

/** Validates one name; `inferType` is only called when a config with `types` is reached. */
export type Validator = (node: AstNode, modifiers: Set<number>, inferType?: () => TypeKind | undefined) => void;

export const MESSAGES = {
	doesNotMatchFormat: '{{type}} name `{{name}}` must match one of the following formats: {{formats}}',
	doesNotMatchFormatTrimmed: '{{type}} name `{{name}}` trimmed as `{{processedName}}` must match one of the following formats: {{formats}}',
	missingAffix: '{{type}} name `{{name}}` must have one of the following {{position}}es: {{affixes}}',
	missingUnderscore: '{{type}} name `{{name}}` must have {{count}} {{position}} underscore(s).',
	satisfyCustom: '{{type}} name `{{name}}` must {{regexMatch}} the RegExp: {{regex}}',
	unexpectedUnderscore: '{{type}} name `{{name}}` must not have a {{position}} underscore.'
};

function lookup<T extends Record<string, unknown>>(table: T, key: string, kind: string): T[keyof T] {
	if (!Object.hasOwn(table, key)) throw new Error(`@temelyos/naming-convention: unknown ${kind} "${key}"`);

	return table[key as keyof T];
}

function normalizeOption(option: NamingOption): NormalizedOption[] {
	let weight = 0;

	option.modifiers?.forEach(modifier => { weight |= lookup(MODIFIERS, modifier, 'modifier'); });
	option.types?.forEach(type => { weight |= lookup(TYPE_MODIFIERS, type, 'type'); });
	// give selectors with a filter the _highest_ priority
	if (option.filter) weight |= 1 << 30;

	option.format?.forEach(format => lookup(FORMAT_CHECKS, format, 'format'));
	for (const underscore of [option.leadingUnderscore, option.trailingUnderscore]) {
		if (underscore != null && !UNDERSCORE_OPTIONS.includes(underscore)) throw new Error(`@temelyos/naming-convention: unknown underscore option "${underscore}"`);
	}

	const normalized: Omit<NormalizedOption, 'selector'> = {
		custom: option.custom ? { match: option.custom.match, regex: new RegExp(option.custom.regex, 'u') } : null,
		filter: option.filter == null
			? null
			: typeof option.filter === 'string'
				? { match: true, regex: new RegExp(option.filter, 'u') }
				: { match: option.filter.match, regex: new RegExp(option.filter.regex, 'u') },
		format: option.format ?? null,
		leadingUnderscore: option.leadingUnderscore ?? null,
		modifiers: option.modifiers?.map(modifier => MODIFIERS[modifier]) ?? null,
		modifierWeight: weight,
		prefix: option.prefix?.length ? option.prefix : null,
		suffix: option.suffix?.length ? option.suffix : null,
		trailingUnderscore: option.trailingUnderscore ?? null,
		types: option.types ?? null
	};

	const selectors = Array.isArray(option.selector) ? option.selector : [option.selector];

	return selectors.map(selector => ({
		...normalized,
		selector: Object.hasOwn(META_SELECTORS, selector)
			? META_SELECTORS[selector as MetaSelectorName]
			: lookup(SELECTORS, selector, 'selector')
	}));
}

function selectorTypeToMessageString(selectorType: string) {
	const notCamelCase = selectorType.replaceAll(/([A-Z])/g, ' $1');

	return notCamelCase.charAt(0).toUpperCase() + notCamelCase.slice(1);
}

/**
 * Whether the inferred type satisfies the config's `types`. typescript-eslint asks the type
 * checker; this has only syntax, so an unknown type is `maybe`, never a guess either way.
 */
function matchesType(config: NormalizedOption, selectorType: number, inferType?: () => TypeKind | undefined): 'maybe' | 'no' | 'yes' {
	if (config.types == null || (SELECTORS_ALLOWED_TO_HAVE_TYPES & selectorType) === 0) return 'yes';

	const kind = inferType?.();

	if (kind === undefined) return 'maybe';

	return (config.types as string[]).includes(kind) ? 'yes' : 'no';
}

export function createValidators(context: Context, options: NamingOption[]): Record<SelectorName, Validator> {
	const normalized = options.flatMap(normalizeOption);

	return Object.fromEntries((Object.keys(SELECTORS) as SelectorName[]).map(type => [type, createValidator(type, context, normalized)])) as Record<SelectorName, Validator>;
}

function createValidator(type: SelectorName, context: Context, allConfigs: NormalizedOption[]): Validator {
	// make sure the "highest priority" configs are checked first
	const selectorType = SELECTORS[type];
	const configs = allConfigs
		.filter(c => (c.selector & selectorType) !== 0 || c.selector === META_SELECTORS.default)
		.sort((a, b) => {
			if (a.selector === b.selector) {
				// sort descending - the type modifiers are "more important"
				return b.modifierWeight - a.modifierWeight;
			}

			const aIsMeta = isMetaSelector(a.selector);
			const bIsMeta = isMetaSelector(b.selector);

			// non-meta selectors should go ahead of meta selectors
			if (aIsMeta && !bIsMeta) return 1;
			if (!aIsMeta && bIsMeta) return -1;

			const aIsMethodOrProperty = isMethodOrPropertySelector(a.selector);
			const bIsMethodOrProperty = isMethodOrPropertySelector(b.selector);

			// for backward compatibility, method and property have higher precedence than other meta selectors
			if (aIsMethodOrProperty && !bIsMethodOrProperty) return -1;
			if (!aIsMethodOrProperty && bIsMethodOrProperty) return 1;

			// sort descending - the meta selectors are "least important"
			return b.selector - a.selector;
		});

	return (node, modifiers, inferType) => {
		const originalName: string = node.type === 'Identifier' || node.type === 'PrivateIdentifier' ? node.name : `${node.value}`;

		for (const config of configs) {
			if (config.filter && config.filter.regex.test(originalName) !== config.filter.match) continue;
			if (config.modifiers?.some(modifier => !modifiers.has(modifier))) continue;

			const typeMatch = matchesType(config, selectorType, inferType);

			if (typeMatch === 'no') continue;

			const failure = check(config, originalName, modifiers);

			if (!failure) return;
			// The type might not be this config's, in which case typescript-eslint would have gone on.
			if (typeMatch === 'maybe') continue;

			context.report({ data: failure.data, messageId: failure.messageId, node: node as never });

			return;
		}
	};

	function check(config: NormalizedOption, originalName: string, modifiers: Set<number>): Failure | undefined {
		let name = originalName;

		for (const position of ['leading', 'trailing'] as const) {
			const result = validateUnderscore(position, config, name, originalName);

			if (typeof result !== 'string') return result;

			name = result;
		}

		for (const position of ['prefix', 'suffix'] as const) {
			const result = validateAffix(position, config, name, originalName);

			if (typeof result !== 'string') return result;

			name = result;
		}

		return validateCustom(config, name, originalName) ?? validatePredefinedFormat(config, name, originalName, modifiers);
	}

	function report(messageId: string, data: Record<string, string | undefined>): Failure {
		return { data: { ...data, type: selectorTypeToMessageString(type) }, messageId };
	}

	/** @returns the name with the underscore removed if valid, otherwise the failure */
	function validateUnderscore(position: 'leading' | 'trailing', config: NormalizedOption, name: string, originalName: string): Failure | string {
		const option = position === 'leading' ? config.leadingUnderscore : config.trailingUnderscore;

		if (!option) return name;

		const isLeading = position === 'leading';
		const hasSingle = isLeading ? name.startsWith('_') : name.endsWith('_');
		const hasDouble = isLeading ? name.startsWith('__') : name.endsWith('__');
		const trimSingle = () => isLeading ? name.slice(1) : name.slice(0, -1);
		const trimDouble = () => isLeading ? name.slice(2) : name.slice(0, -2);

		switch (option) {
			case 'allow':
				return hasSingle ? trimSingle() : name;
			case 'allowDouble':
				return hasDouble ? trimDouble() : name;
			case 'allowSingleOrDouble':
				return hasDouble ? trimDouble() : hasSingle ? trimSingle() : name;
			case 'forbid':
				return hasSingle ? report('unexpectedUnderscore', { count: 'one', name: originalName, position }) : name;
			case 'require':
				return hasSingle ? trimSingle() : report('missingUnderscore', { count: 'one', name: originalName, position });
			case 'requireDouble':
				return hasDouble ? trimDouble() : report('missingUnderscore', { count: 'two', name: originalName, position });
		}
	}

	/** @returns the name with the affix removed if valid, otherwise the failure */
	function validateAffix(position: 'prefix' | 'suffix', config: NormalizedOption, name: string, originalName: string): Failure | string {
		const affixes = config[position];

		if (!affixes?.length) return name;

		for (const affix of affixes) {
			if (position === 'prefix' ? name.startsWith(affix) : name.endsWith(affix)) {
				return position === 'prefix' ? name.slice(affix.length) : name.slice(0, -affix.length);
			}
		}

		return report('missingAffix', { affixes: affixes.join(', '), name: originalName, position });
	}

	function validateCustom(config: NormalizedOption, name: string, originalName: string): Failure | undefined {
		const custom = config.custom;

		if (!custom || custom.regex.test(name) === custom.match) return undefined;

		return report('satisfyCustom', { name: originalName, regex: custom.regex.toString(), regexMatch: custom.match ? 'match' : 'not match' });
	}

	function validatePredefinedFormat(config: NormalizedOption, name: string, originalName: string, modifiers: Set<number>): Failure | undefined {
		const formats = config.format;

		if (!formats?.length) return undefined;
		if (!modifiers.has(MODIFIERS.requiresQuotes) && formats.some(format => FORMAT_CHECKS[format](name))) return undefined;

		return report(originalName === name ? 'doesNotMatchFormat' : 'doesNotMatchFormatTrimmed', {
			formats: formats.join(', '),
			name: originalName,
			processedName: name
		});
	}
}
