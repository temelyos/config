// Ported from typescript-eslint's naming-convention, which took them from
// tslint-consistent-codestyle. Not regexes, so non-English letters count as cased.

function isPascalCase(name: string) {
	return name.length === 0 || (name[0] === name[0]!.toUpperCase() && !name.includes('_'));
}

function isStrictPascalCase(name: string) {
	return name.length === 0 || (name[0] === name[0]!.toUpperCase() && hasStrictCamelHumps(name, true));
}

function isCamelCase(name: string) {
	return name.length === 0 || (name[0] === name[0]!.toLowerCase() && !name.includes('_'));
}

function isStrictCamelCase(name: string) {
	return name.length === 0 || (name[0] === name[0]!.toLowerCase() && hasStrictCamelHumps(name, false));
}

function hasStrictCamelHumps(name: string, isUpper: boolean) {
	const isUppercaseChar = (char: string) => char === char.toUpperCase() && char !== char.toLowerCase();

	if (name.startsWith('_')) return false;

	for (let i = 1; i < name.length; ++i) {
		if (name[i] === '_') return false;

		if (isUpper === isUppercaseChar(name[i]!)) {
			if (isUpper) return false;
		} else {
			isUpper = !isUpper;
		}
	}

	return true;
}

function isSnakeCase(name: string) {
	return name.length === 0 || (name === name.toLowerCase() && validateUnderscores(name));
}

function isUpperCase(name: string) {
	return name.length === 0 || (name === name.toUpperCase() && validateUnderscores(name));
}

/** No leading, trailing or adjacent underscores. */
function validateUnderscores(name: string) {
	if (name.startsWith('_')) return false;

	let wasUnderscore = false;

	for (let i = 1; i < name.length; ++i) {
		if (name[i] === '_') {
			if (wasUnderscore) return false;

			wasUnderscore = true;
		} else {
			wasUnderscore = false;
		}
	}

	return !wasUnderscore;
}

export const FORMAT_CHECKS = {
	camelCase: isCamelCase,
	PascalCase: isPascalCase,
	snake_case: isSnakeCase,
	strictCamelCase: isStrictCamelCase,
	StrictPascalCase: isStrictPascalCase,
	UPPER_CASE: isUpperCase
};

export type FormatName = keyof typeof FORMAT_CHECKS;
