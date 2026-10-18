import type { Context } from '@oxlint/plugins';

import { type AstNode, isBuiltIn, resolveVariable } from './ast.js';

/**
 * The `types` a name can be checked against, or `other` for a type that is none of them (an
 * object, a mixed union, `any`). typescript-eslint reads these from the type checker; here they
 * come from syntax alone, and anything syntax cannot settle is `undefined`, never a guess.
 */
export type TypeKind = 'array' | 'boolean' | 'function' | 'number' | 'other' | 'string';

const COMPARISON_OPERATORS = new Set(['!=', '!==', '<', '<=', '==', '===', '>', '>=', 'in', 'instanceof']);
const NUMERIC_OPERATORS = new Set(['%', '&', '*', '**', '-', '/', '<<', '>>', '^', '|']);

const GLOBAL_CALLS: Record<string, TypeKind> = { Array: 'array', Boolean: 'boolean', Number: 'number', parseFloat: 'number', parseInt: 'number', String: 'string' };
const STATIC_CALLS: Record<string, Record<string, TypeKind>> = {
	Array: { from: 'array', isArray: 'boolean', of: 'array' },
	Date: { now: 'number', parse: 'number', UTC: 'number' },
	JSON: { stringify: 'string' },
	Number: { isFinite: 'boolean', isInteger: 'boolean', isNaN: 'boolean', isSafeInteger: 'boolean', parseFloat: 'number', parseInt: 'number' },
	Object: { entries: 'array', getOwnPropertyNames: 'array', hasOwn: 'boolean', is: 'boolean', isExtensible: 'boolean', isFrozen: 'boolean', isSealed: 'boolean', keys: 'array', values: 'array' },
	String: { fromCharCode: 'string', fromCodePoint: 'string', raw: 'string' }
};
/** Methods whose result is settled by the receiver's type. */
const METHOD_RESULTS: Partial<Record<TypeKind, Record<string, TypeKind>>> = {
	array: {
		concat: 'array', every: 'boolean', filter: 'array', findIndex: 'number', findLastIndex: 'number', flat: 'array', flatMap: 'array',
		includes: 'boolean', indexOf: 'number', join: 'string', lastIndexOf: 'number', map: 'array', push: 'number', reverse: 'array',
		slice: 'array', some: 'boolean', sort: 'array', splice: 'array', toReversed: 'array', toSorted: 'array', toSpliced: 'array', unshift: 'number'
	},
	number: { toExponential: 'string', toFixed: 'string', toPrecision: 'string' },
	string: {
		charAt: 'string', charCodeAt: 'number', codePointAt: 'number', concat: 'string', endsWith: 'boolean', includes: 'boolean',
		indexOf: 'number', lastIndexOf: 'number', localeCompare: 'number', normalize: 'string', padEnd: 'string', padStart: 'string',
		repeat: 'string', replace: 'string', replaceAll: 'string', search: 'number', slice: 'string', split: 'array', startsWith: 'boolean',
		substring: 'string', toLowerCase: 'string', toUpperCase: 'string', trim: 'string', trimEnd: 'string', trimStart: 'string'
	}
};
/** Well-known object types: never one of the checked kinds. */
const OBJECT_TYPE_NAMES = new Set(['Date', 'Error', 'Map', 'Promise', 'Record', 'RegExp', 'Set', 'URL', 'WeakMap', 'WeakSet']);
const MAX_DEPTH = 8;

/** Several possible kinds are one kind when they agree, `other` when they do not. */
function combine(kinds: (TypeKind | undefined)[]): TypeKind | undefined {
	if (kinds.includes(undefined)) return undefined;

	return kinds.every(kind => kind === kinds[0]) ? kinds[0] : 'other';
}

function isObjectValue(node: AstNode | null | undefined): boolean {
	if (node?.type === 'TSSatisfiesExpression' || node?.type === 'ParenthesizedExpression') return isObjectValue(node.expression);

	return node?.type === 'ObjectExpression' || node?.type === 'ClassExpression'
		|| (node?.type === 'NewExpression' && !(node.callee.type === 'Identifier' && (node.callee.name === 'Array' || node.callee.name === 'Proxy')));
}

/** `null` and `undefined`, which the type checker drops from a name's type before comparing. */
function isNullish(node: AstNode) {
	return (node.type === 'Literal' && node.value === null && !node.regex) || (node.type === 'Identifier' && node.name === 'undefined');
}

export function inferTypeNode(node: AstNode | null | undefined): TypeKind | undefined {
	switch (node?.type) {
		case 'TSBooleanKeyword':
			return 'boolean';
		case 'TSNumberKeyword':
			return 'number';
		case 'TSStringKeyword':
		case 'TSTemplateLiteralType':
			return 'string';
		case 'TSArrayType':
		case 'TSTupleType':
			return 'array';
		case 'TSFunctionType':
			return 'function';
		case 'TSTypePredicate':
			return node.asserts ? 'other' : 'boolean';
		case 'TSAnyKeyword':
		case 'TSBigIntKeyword':
		case 'TSConstructorType':
		case 'TSNeverKeyword':
		case 'TSNullKeyword':
		case 'TSObjectKeyword':
		case 'TSSymbolKeyword':
		case 'TSUndefinedKeyword':
		case 'TSUnknownKeyword':
		case 'TSVoidKeyword':
			return 'other';
		case 'TSLiteralType': {
			const literal = node.literal;

			if (literal.type === 'TemplateLiteral') return 'string';
			if (literal.type === 'UnaryExpression') return 'number';

			return typeof literal.value === 'boolean' || typeof literal.value === 'number' || typeof literal.value === 'string' ? typeof literal.value as TypeKind : 'other';
		}
		case 'TSParenthesizedType':
			return inferTypeNode(node.typeAnnotation);
		case 'TSTypeOperator':
			return node.operator === 'readonly' && inferTypeNode(node.typeAnnotation) === 'array' ? 'array' : undefined;
		case 'TSTypeLiteral':
			return node.members.some((member: AstNode) => member.type === 'TSCallSignatureDeclaration') ? 'function' : 'other';
		case 'TSTypeReference': {
			const name = node.typeName.type === 'Identifier' ? node.typeName.name : undefined;

			if (name === 'Array' || name === 'ReadonlyArray') return 'array';

			return name && OBJECT_TYPE_NAMES.has(name) ? 'other' : undefined;
		}
		case 'TSUnionType': {
			// the type checker drops null and undefined before comparing
			const members = node.types.filter((member: AstNode) => member.type !== 'TSNullKeyword' && member.type !== 'TSUndefinedKeyword');

			return members.length ? combine(members.map(inferTypeNode)) : 'other';
		}
	}

	return undefined;
}

export function createTypeInference(context: Context) {
	const declarators = new Map<AstNode, TypeKind | undefined>();

	function inferDeclarator(declarator: AstNode, depth: number): TypeKind | undefined {
		if (declarators.has(declarator)) return declarators.get(declarator);

		// a cycle reads as unknown
		declarators.set(declarator, undefined);

		const annotation = declarator.id.typeAnnotation?.typeAnnotation;
		let kind: TypeKind | undefined;

		if (annotation) {
			// Whatever an unresolved annotation names, an object or instance can only be assigned to an
			// object type, which is none of the checked kinds.
			kind = inferTypeNode(annotation) ?? (isObjectValue(declarator.init) ? 'other' : undefined);
		} else if (declarator.init) {
			kind = inferExpression(declarator.init, depth + 1);
		} else if (declarator.parent?.parent?.type === 'ForInStatement' && declarator.parent.parent.left === declarator.parent) {
			kind = 'string';
		}

		declarators.set(declarator, kind);

		return kind;
	}

	/** A referenced name's type, only when it cannot have been narrowed into something else. */
	function inferReference(identifier: AstNode, depth: number): TypeKind | undefined {
		if (identifier.name === 'undefined' && isBuiltIn(context, identifier)) return 'other';
		if ((identifier.name === 'NaN' || identifier.name === 'Infinity') && isBuiltIn(context, identifier)) return 'number';

		const definitions = resolveVariable(context, identifier)?.defs;

		if (definitions?.length !== 1) return undefined;

		const definition = definitions[0]!;
		const node = definition.node as unknown as AstNode;
		let kind: TypeKind | undefined;

		if (definition.type === 'FunctionName') {
			kind = 'function';
		} else if (definition.type === 'Variable' && node.type === 'VariableDeclarator' && node.id === (definition.name as unknown)) {
			kind = inferDeclarator(node, depth);
		} else if (definition.type === 'Parameter') {
			kind = inferTypeNode((definition.name as unknown as AstNode).typeAnnotation?.typeAnnotation);
		}

		// a union can narrow at the reference, so only a single declared kind carries over
		return kind === 'other' ? undefined : kind;
	}

	/** A called function's declared or inferred return type. */
	function inferReturn(callee: AstNode, depth: number): TypeKind | undefined {
		if (callee.type !== 'Identifier') return undefined;

		const definitions = resolveVariable(context, callee)?.defs;

		if (definitions?.length !== 1) return undefined;

		const definition = definitions[0]!;
		const node = definition.node as unknown as AstNode;
		const fn = definition.type === 'FunctionName'
			? node
			: definition.type === 'Variable' && node.type === 'VariableDeclarator' && !node.id.typeAnnotation
				&& (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
				? node.init
				: undefined;

		if (!fn || fn.generator) return undefined;
		if (fn.async) return 'other';
		if (fn.returnType) return inferTypeNode(fn.returnType.typeAnnotation);

		return fn.expression ? inferExpression(fn.body, depth + 1) : undefined;
	}

	function inferCall(node: AstNode, depth: number): TypeKind | undefined {
		const callee = node.callee;

		if (callee.type === 'Identifier') {
			return Object.hasOwn(GLOBAL_CALLS, callee.name) && isBuiltIn(context, callee) ? GLOBAL_CALLS[callee.name] : inferReturn(callee, depth);
		}

		if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') return undefined;

		const method: string = callee.property.name;
		const receiver = callee.object;

		if (receiver.type === 'Identifier' && isBuiltIn(context, receiver)) {
			if (receiver.name === 'Math') return 'number';

			const result = STATIC_CALLS[receiver.name]?.[method];

			if (result) return result;
		}

		if (method === 'toString') return 'string';

		const receiverKind = inferExpression(receiver, depth + 1);

		return receiverKind ? METHOD_RESULTS[receiverKind]?.[method] : undefined;
	}

	function inferExpression(node: AstNode | null | undefined, depth: number): TypeKind | undefined {
		if (!node || depth > MAX_DEPTH) return undefined;

		switch (node.type) {
			case 'Literal':
				if (node.regex || node.bigint !== undefined || node.value === null) return 'other';

				return typeof node.value as TypeKind;
			case 'TemplateLiteral':
				return 'string';
			case 'ArrayExpression':
				return 'array';
			case 'ArrowFunctionExpression':
			case 'FunctionExpression':
				return 'function';
			case 'ClassExpression':
			case 'ImportExpression':
			case 'JSXElement':
			case 'JSXFragment':
			case 'ObjectExpression':
				return 'other';
			case 'NewExpression':
				if (node.callee.type === 'Identifier' && isBuiltIn(context, node.callee)) {
					if (node.callee.name === 'Array') return 'array';
					// a proxy has its target's type
					if (node.callee.name === 'Proxy') return undefined;
				}

				return 'other';
			case 'UnaryExpression':
				switch (node.operator) {
					case '!':
					case 'delete':
						return 'boolean';
					case 'typeof':
						return 'string';
					case 'void':
						return 'other';
					case '+':
						return 'number';
					default:
						// `-` and `~` keep a bigint a bigint
						return inferExpression(node.argument, depth + 1) === 'number' ? 'number' : undefined;
				}
			case 'BinaryExpression': {
				if (COMPARISON_OPERATORS.has(node.operator)) return 'boolean';
				if (node.operator === '>>>') return 'number';

				const left = inferExpression(node.left, depth + 1);
				const right = inferExpression(node.right, depth + 1);

				if (node.operator === '+' && (left === 'string' || right === 'string')) return 'string';
				if ((node.operator === '+' || NUMERIC_OPERATORS.has(node.operator)) && left === 'number' && right === 'number') return 'number';

				return undefined;
			}
			case 'ConditionalExpression': {
				const branches = [node.consequent, node.alternate].filter(branch => !isNullish(branch));

				return branches.length ? combine(branches.map(branch => inferExpression(branch, depth + 1))) : 'other';
			}
			case 'LogicalExpression': {
				// `||` and `??` drop parts of the left operand's type and `&&` keeps only its falsy ones,
				// so only operands that all agree settle the result
				if (node.operator === '&&' && (isNullish(node.left) || isNullish(node.right))) return undefined;

				const operands = [node.left, node.right].filter(operand => !isNullish(operand));
				const kinds = operands.map(operand => inferExpression(operand, depth + 1));
				const [first] = kinds;

				if (first === undefined || first === 'other' || kinds.some(kind => kind !== first)) return undefined;
				if (node.operator === '&&' && first !== 'boolean' && first !== 'number' && first !== 'string') return undefined;

				return first;
			}
			case 'SequenceExpression':
				return inferExpression(node.expressions.at(-1), depth + 1);
			case 'AssignmentExpression':
				return node.operator === '=' ? inferExpression(node.right, depth + 1) : undefined;
			case 'TSAsExpression':
			case 'TSTypeAssertion': {
				const annotation = node.typeAnnotation;
				const isConst = annotation.type === 'TSTypeReference' && annotation.typeName.type === 'Identifier' && annotation.typeName.name === 'const';

				return isConst ? inferExpression(node.expression, depth + 1) : inferTypeNode(annotation);
			}
			case 'ChainExpression':
			case 'ParenthesizedExpression':
			case 'TSNonNullExpression':
			case 'TSSatisfiesExpression':
				return inferExpression(node.expression, depth + 1);
			case 'CallExpression':
				return inferCall(node, depth);
			case 'MemberExpression': {
				if (node.computed || node.property.type !== 'Identifier' || node.property.name !== 'length') return undefined;

				const receiver = inferExpression(node.object, depth + 1);

				return receiver === 'array' || receiver === 'string' ? 'number' : undefined;
			}
			case 'Identifier':
				return inferReference(node, depth);
		}

		return undefined;
	}

	/**
	 * The declared type of a name at its declaration: the annotation if there is one, otherwise what
	 * TypeScript infers from the initializer or default value.
	 */
	function inferDeclaredType(id: AstNode): TypeKind | undefined {
		const parent = id.parent;

		if (parent?.type === 'VariableDeclarator' && parent.id === id) return inferDeclarator(parent, 0);

		const annotation = id.typeAnnotation?.typeAnnotation;

		if (annotation) return inferTypeNode(annotation);
		// A default alone types a parameter only where nothing else does: a destructured default is
		// unioned with the property's type, and a callback's parameter is typed by its call.
		if (parent?.type === 'AssignmentPattern' && parent.left === id && isUncontextualParameter(parent)) return inferExpression(parent.right, 1);

		return undefined;
	}

	function isUncontextualParameter(pattern: AstNode) {
		const owner = pattern.parent?.type === 'TSParameterProperty' ? pattern.parent.parent : pattern.parent;

		return owner?.type === 'FunctionDeclaration' || (owner?.type === 'FunctionExpression' && owner.parent?.type === 'MethodDefinition');
	}

	return {
		inferDeclaredType,
		/** The declared type of a class, object or interface member, from its annotation or value. */
		inferMemberType(member: AstNode): TypeKind | undefined {
			if (member.kind === 'get') return inferTypeNode(member.value?.returnType?.typeAnnotation);

			const annotation = member.typeAnnotation?.typeAnnotation;

			if (annotation) return inferTypeNode(annotation);

			return member.kind === 'set' || !member.value ? undefined : inferExpression(member.value, 0);
		}
	};
}
