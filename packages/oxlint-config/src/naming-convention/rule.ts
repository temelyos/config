import type { Context, Rule, Scope } from '@oxlint/plugins';

import { type AstNode, getIdentifiersFromPattern, getOuterScope, getScope } from './ast.js';
import { MODIFIERS } from './enums.js';
import { createTypeInference } from './infer-type.js';
import { createValidators, MESSAGES, type NamingOption, type Validator } from './validator.js';

const DEFAULT_OPTIONS: NamingOption[] = [
	{ format: ['camelCase'], leadingUnderscore: 'allow', selector: 'default', trailingUnderscore: 'allow' },
	{ format: ['camelCase', 'PascalCase'], selector: 'import' },
	{ format: ['camelCase', 'UPPER_CASE'], leadingUnderscore: 'allow', selector: 'variable', trailingUnderscore: 'allow' },
	{ format: ['PascalCase'], selector: 'typeLike' }
];

const FUNCTION_VALUES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'TSEmptyBodyFunctionExpression']);
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;

function keyName(key: AstNode): string {
	return key.type === 'Identifier' || key.type === 'PrivateIdentifier' ? key.name : `${key.value}`;
}

function isGlobal(scope: Scope | null) {
	return scope?.type === 'global' || scope?.type === 'module';
}

function isExported(node: AstNode | null | undefined, name: string, scope: Scope | null) {
	if (node?.parent?.type === 'ExportDefaultDeclaration' || node?.parent?.type === 'ExportNamedDeclaration') return true;

	for (const ref of scope?.set.get(name)?.references ?? []) {
		const refParent = (ref.identifier as unknown as AstNode).parent;

		if (refParent?.type === 'ExportDefaultDeclaration' || refParent?.type === 'ExportSpecifier') return true;
	}

	return false;
}

function isDestructured(id: AstNode) {
	return (id.parent?.type === 'Property' && id.parent.shorthand)
		|| (id.parent?.type === 'AssignmentPattern' && id.parent.parent?.type === 'Property' && id.parent.parent.shorthand);
}

function getMemberModifiers(node: AstNode) {
	const modifiers = new Set<number>();

	if (node.key?.type === 'PrivateIdentifier') {
		modifiers.add(MODIFIERS['#private']);
	} else if (node.accessibility) {
		modifiers.add(MODIFIERS[node.accessibility as 'private' | 'protected' | 'public']);
	} else {
		modifiers.add(MODIFIERS.public);
	}

	if (node.static) modifiers.add(MODIFIERS.static);
	if (node.readonly) modifiers.add(MODIFIERS.readonly);
	if (node.override) modifiers.add(MODIFIERS.override);
	if (node.type.startsWith('TSAbstract')) modifiers.add(MODIFIERS.abstract);

	return modifiers;
}

export const namingConvention: Rule = {
	meta: {
		docs: {
			description: 'Enforce naming conventions for everything across a codebase (typescript-eslint\'s rule, with types inferred from syntax)'
		},
		messages: MESSAGES,
		schema: { items: { type: 'object' }, type: 'array' },
		type: 'suggestion'
	},
	create(context: Context) {
		const options = context.options.length ? context.options as unknown as NamingOption[] : DEFAULT_OPTIONS;
		const validators = createValidators(context, options);
		const { inferDeclaredType, inferMemberType } = createTypeInference(context);

		/** typescript-eslint counts reads; an exported name is used. */
		function isUnused(name: string, scope: Scope | null, node?: AstNode | null) {
			let variable = null;

			for (let current = scope; current && !variable; current = current.upper) variable = current.set.get(name) ?? null;

			if (!variable || isExported(node, name, scope)) return false;

			return !variable.references.some(ref => ref.isRead());
		}

		function handleMember(validator: Validator, node: AstNode, modifiers: Set<number>, typed = false) {
			const key = node.key;

			if (!IDENTIFIER.test(keyName(key))) modifiers.add(MODIFIERS.requiresQuotes);

			validator(key, modifiers, typed ? () => inferMemberType(node) : undefined);
		}

		function handleFunctionName(node: AstNode) {
			if (node.id == null) return;

			const modifiers = new Set<number>();
			const scope = getOuterScope(context, node);

			if (isGlobal(scope)) modifiers.add(MODIFIERS.global);
			if (isExported(node, node.id.name, scope)) modifiers.add(MODIFIERS.exported);
			if (isUnused(node.id.name, scope, node)) modifiers.add(MODIFIERS.unused);
			if (node.async) modifiers.add(MODIFIERS.async);

			validators.function(node.id, modifiers);
		}

		function handleParameters(node: AstNode) {
			for (const param of node.params) {
				if (param.type === 'TSParameterProperty') continue;

				for (const id of getIdentifiersFromPattern(param)) {
					const modifiers = new Set<number>();

					if (isDestructured(id)) modifiers.add(MODIFIERS.destructured);
					if (isUnused(id.name, getScope(context, id))) modifiers.add(MODIFIERS.unused);

					validators.parameter(id, modifiers, () => inferDeclaredType(id));
				}
			}
		}

		function handleClassProperty(node: AstNode) {
			if (node.computed) return;

			if (FUNCTION_VALUES.has(node.value?.type)) {
				const modifiers = getMemberModifiers(node);

				if (node.value.async) modifiers.add(MODIFIERS.async);

				handleMember(validators.classMethod, node, modifiers);
			} else {
				handleMember(validators.classProperty, node, getMemberModifiers(node), true);
			}
		}

		function handleMethod(node: AstNode) {
			if (node.computed) return;

			if (node.kind === 'method') {
				const modifiers = getMemberModifiers(node);

				if (node.value?.async) modifiers.add(MODIFIERS.async);

				handleMember(validators.classMethod, node, modifiers);
			} else if (node.kind === 'get' || node.kind === 'set') {
				handleMember(validators.classicAccessor, node, getMemberModifiers(node), true);
			}
		}

		function handleTypeDeclaration(node: AstNode, validator: Validator, outer: boolean) {
			const modifiers = new Set<number>();
			const scope = outer ? getOuterScope(context, node) : getScope(context, node);

			if (node.abstract) modifiers.add(MODIFIERS.abstract);
			if (isExported(node, node.id.name, scope)) modifiers.add(MODIFIERS.exported);
			if (isUnused(node.id.name, scope, node)) modifiers.add(MODIFIERS.unused);

			validator(node.id, modifiers);
		}

		function handleFunction(node: AstNode) {
			if (node.type !== 'TSEmptyBodyFunctionExpression') handleFunctionName(node);

			handleParameters(node);
		}

		function handleClass(node: AstNode) {
			if (node.id) handleTypeDeclaration(node, validators.class, true);
		}

		function handleImport(node: AstNode) {
			const modifiers = new Set<number>();

			if (node.type === 'ImportDefaultSpecifier') {
				modifiers.add(MODIFIERS.default);
			} else if (node.type === 'ImportNamespaceSpecifier') {
				modifiers.add(MODIFIERS.namespace);
			} else {
				if (node.imported.type === 'Identifier' && node.imported.name !== 'default') return;

				modifiers.add(MODIFIERS.default);
			}

			validators.import(node.local, modifiers);
		}

		return {
			AccessorProperty: (node: AstNode) => handleMember(validators.autoAccessor, node, getMemberModifiers(node)),
			ArrowFunctionExpression: handleParameters,
			ClassDeclaration: handleClass,
			ClassExpression: handleClass,
			FunctionDeclaration: handleFunction,
			FunctionExpression: handleFunction,
			ImportDefaultSpecifier: handleImport,
			ImportNamespaceSpecifier: handleImport,
			ImportSpecifier: handleImport,
			MethodDefinition: handleMethod,
			Property(node: AstNode) {
				if (node.computed) return;

				if (node.kind === 'get' || node.kind === 'set') {
					handleMember(validators.classicAccessor, node, new Set([MODIFIERS.public]), true);
				} else if (FUNCTION_VALUES.has(node.value?.type)) {
					const modifiers = new Set<number>([MODIFIERS.public]);

					if (node.value.async) modifiers.add(MODIFIERS.async);

					handleMember(validators.objectLiteralMethod, node, modifiers);
				} else if (node.parent?.type !== 'ObjectPattern') {
					handleMember(validators.objectLiteralProperty, node, new Set([MODIFIERS.public]), true);
				}
			},
			PropertyDefinition: handleClassProperty,
			TSAbstractAccessorProperty: (node: AstNode) => handleMember(validators.autoAccessor, node, getMemberModifiers(node)),
			TSAbstractMethodDefinition: handleMethod,
			TSAbstractPropertyDefinition: handleClassProperty,
			TSDeclareFunction: handleFunction,
			TSEmptyBodyFunctionExpression: handleFunction,
			TSEnumDeclaration: (node: AstNode) => handleTypeDeclaration(node, validators.enum, true),
			TSEnumMember(node: AstNode) {
				const modifiers = new Set<number>();

				if (!IDENTIFIER.test(keyName(node.id))) modifiers.add(MODIFIERS.requiresQuotes);

				validators.enumMember(node.id, modifiers);
			},
			TSInterfaceDeclaration: (node: AstNode) => handleTypeDeclaration(node, validators.interface, false),
			TSMethodSignature(node: AstNode) {
				if (!node.computed) handleMember(validators.typeMethod, node, new Set([MODIFIERS.public]));
			},
			TSParameterProperty(node: AstNode) {
				const modifiers = getMemberModifiers(node);

				for (const id of getIdentifiersFromPattern(node.parameter)) validators.parameterProperty(id, modifiers, () => inferDeclaredType(id));
			},
			TSPropertySignature(node: AstNode) {
				if (node.computed) return;

				if (node.typeAnnotation?.typeAnnotation?.type === 'TSFunctionType') {
					handleMember(validators.typeMethod, node, new Set([MODIFIERS.public]));
				} else {
					const modifiers = new Set<number>([MODIFIERS.public]);

					if (node.readonly) modifiers.add(MODIFIERS.readonly);

					handleMember(validators.typeProperty, node, modifiers, true);
				}
			},
			TSTypeAliasDeclaration: (node: AstNode) => handleTypeDeclaration(node, validators.typeAlias, false),
			TSTypeParameter(node: AstNode) {
				if (node.parent?.type !== 'TSTypeParameterDeclaration') return;

				const modifiers = new Set<number>();

				if (isUnused(node.name.name, getScope(context, node))) modifiers.add(MODIFIERS.unused);

				validators.typeParameter(node.name, modifiers);
			},
			VariableDeclarator(node: AstNode) {
				const baseModifiers = new Set<number>();

				if (node.parent?.kind === 'const') baseModifiers.add(MODIFIERS.const);
				if (isGlobal(getScope(context, node))) baseModifiers.add(MODIFIERS.global);

				for (const id of getIdentifiersFromPattern(node.id)) {
					const modifiers = new Set(baseModifiers);
					const scope = getScope(context, id);

					if (isDestructured(id)) modifiers.add(MODIFIERS.destructured);
					if (isExported(node.parent, id.name, scope)) modifiers.add(MODIFIERS.exported);
					if (isUnused(id.name, scope, node.parent)) modifiers.add(MODIFIERS.unused);
					if (id === node.id && node.init?.async) modifiers.add(MODIFIERS.async);

					validators.variable(id, modifiers, () => inferDeclaredType(id));
				}
			}
		} as never;
	}
};
