// Ported from typescript-eslint's naming-convention (8.70.0). The bit values order the configs, so
// they are kept exactly: a filter outranks types, types outrank modifiers.

export const Selectors = {
	autoAccessor: 1 << 12,
	// typeLike
	class: 1 << 13,
	classicAccessor: 1 << 4,
	classMethod: 1 << 6,
	classProperty: 1 << 9,
	enum: 1 << 16,
	enumMember: 1 << 5,
	function: 1 << 1,
	// other
	import: 1 << 18,
	interface: 1 << 14,
	objectLiteralMethod: 1 << 7,
	objectLiteralProperty: 1 << 10,
	parameter: 1 << 2,
	// memberLike
	parameterProperty: 1 << 3,
	typeAlias: 1 << 15,
	typeMethod: 1 << 8,
	typeParameter: 1 << 17,
	typeProperty: 1 << 11,
	// variableLike
	variable: 1 << 0
} as const;

export const MetaSelectors = {
	accessor: Selectors.classicAccessor | Selectors.autoAccessor,
	default: -1,
	memberLike: Selectors.classProperty | Selectors.objectLiteralProperty | Selectors.typeProperty | Selectors.parameterProperty
		| Selectors.enumMember | Selectors.classMethod | Selectors.objectLiteralMethod | Selectors.typeMethod
		| Selectors.classicAccessor | Selectors.autoAccessor,
	method: Selectors.classMethod | Selectors.objectLiteralMethod | Selectors.typeMethod,
	property: Selectors.classProperty | Selectors.objectLiteralProperty | Selectors.typeProperty,
	typeLike: Selectors.class | Selectors.interface | Selectors.typeAlias | Selectors.enum | Selectors.typeParameter,
	variableLike: Selectors.variable | Selectors.function | Selectors.parameter
} as const;

export const Modifiers = {
	'#private': 1 << 6,
	'abstract': 1 << 7,
	'async': 1 << 14,
	'const': 1 << 0,
	'default': 1 << 15,
	'destructured': 1 << 8,
	'exported': 1 << 10,
	'global': 1 << 9,
	'namespace': 1 << 16,
	'override': 1 << 13,
	'private': 1 << 5,
	'protected': 1 << 4,
	'public': 1 << 3,
	'readonly': 1 << 1,
	'requiresQuotes': 1 << 12,
	'static': 1 << 2,
	'unused': 1 << 11
} as const;

export const TypeModifiers = {
	array: 1 << 21,
	boolean: 1 << 17,
	function: 1 << 20,
	number: 1 << 19,
	string: 1 << 18
} as const;

export const UNDERSCORE_OPTIONS = ['forbid', 'allow', 'require', 'requireDouble', 'allowDouble', 'allowSingleOrDouble'] as const;

/** The selectors whose `types` are checked; for any other selector, `types` always matches. */
export const SELECTORS_ALLOWED_TO_HAVE_TYPES = Selectors.variable | Selectors.parameter | Selectors.classProperty
	| Selectors.objectLiteralProperty | Selectors.typeProperty | Selectors.parameterProperty | Selectors.classicAccessor;

export type MetaSelectorName = keyof typeof MetaSelectors;
export type ModifierName = keyof typeof Modifiers;
export type SelectorName = keyof typeof Selectors;
export type TypeModifierName = keyof typeof TypeModifiers;
export type UnderscoreOption = typeof UNDERSCORE_OPTIONS[number];

export function isMetaSelector(selector: number) {
	return Object.values(MetaSelectors).includes(selector as never);
}

export function isMethodOrPropertySelector(selector: number) {
	return selector === MetaSelectors.method || selector === MetaSelectors.property;
}
