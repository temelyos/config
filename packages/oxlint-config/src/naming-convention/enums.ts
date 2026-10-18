// Ported from typescript-eslint's naming-convention (8.70.0). The bit values order the configs, so
// they are kept exactly: a filter outranks types, types outrank modifiers.

export const SELECTORS = {
	// variableLike
	variable: 1 << 0,
	function: 1 << 1,
	parameter: 1 << 2,
	// memberLike
	parameterProperty: 1 << 3,
	classicAccessor: 1 << 4,
	enumMember: 1 << 5,
	classMethod: 1 << 6,
	objectLiteralMethod: 1 << 7,
	typeMethod: 1 << 8,
	classProperty: 1 << 9,
	objectLiteralProperty: 1 << 10,
	typeProperty: 1 << 11,
	autoAccessor: 1 << 12,
	// typeLike
	class: 1 << 13,
	interface: 1 << 14,
	typeAlias: 1 << 15,
	enum: 1 << 16,
	typeParameter: 1 << 17,
	// other
	import: 1 << 18
} as const;

export const META_SELECTORS = {
	default: -1,
	variableLike: SELECTORS.variable | SELECTORS.function | SELECTORS.parameter,
	memberLike: SELECTORS.classProperty | SELECTORS.objectLiteralProperty | SELECTORS.typeProperty | SELECTORS.parameterProperty
		| SELECTORS.enumMember | SELECTORS.classMethod | SELECTORS.objectLiteralMethod | SELECTORS.typeMethod
		| SELECTORS.classicAccessor | SELECTORS.autoAccessor,
	typeLike: SELECTORS.class | SELECTORS.interface | SELECTORS.typeAlias | SELECTORS.enum | SELECTORS.typeParameter,
	method: SELECTORS.classMethod | SELECTORS.objectLiteralMethod | SELECTORS.typeMethod,
	property: SELECTORS.classProperty | SELECTORS.objectLiteralProperty | SELECTORS.typeProperty,
	accessor: SELECTORS.classicAccessor | SELECTORS.autoAccessor
} as const;

export const MODIFIERS = {
	'const': 1 << 0,
	'readonly': 1 << 1,
	'static': 1 << 2,
	'public': 1 << 3,
	'protected': 1 << 4,
	'private': 1 << 5,
	'#private': 1 << 6,
	'abstract': 1 << 7,
	'destructured': 1 << 8,
	'global': 1 << 9,
	'exported': 1 << 10,
	'unused': 1 << 11,
	'requiresQuotes': 1 << 12,
	'override': 1 << 13,
	'async': 1 << 14,
	'default': 1 << 15,
	'namespace': 1 << 16
} as const;

export const TYPE_MODIFIERS = {
	boolean: 1 << 17,
	string: 1 << 18,
	number: 1 << 19,
	function: 1 << 20,
	array: 1 << 21
} as const;

export const UNDERSCORE_OPTIONS = ['forbid', 'allow', 'require', 'requireDouble', 'allowDouble', 'allowSingleOrDouble'] as const;

/** The selectors whose `types` are checked; for any other selector, `types` always matches. */
export const SELECTORS_ALLOWED_TO_HAVE_TYPES = SELECTORS.variable | SELECTORS.parameter | SELECTORS.classProperty
	| SELECTORS.objectLiteralProperty | SELECTORS.typeProperty | SELECTORS.parameterProperty | SELECTORS.classicAccessor;

export type MetaSelectorName = keyof typeof META_SELECTORS;
export type ModifierName = keyof typeof MODIFIERS;
export type SelectorName = keyof typeof SELECTORS;
export type TypeModifierName = keyof typeof TYPE_MODIFIERS;
export type UnderscoreOption = typeof UNDERSCORE_OPTIONS[number];

export function isMetaSelector(selector: number) {
	return Object.values(META_SELECTORS).includes(selector as never);
}

export function isMethodOrPropertySelector(selector: number) {
	return selector === META_SELECTORS.method || selector === META_SELECTORS.property;
}
