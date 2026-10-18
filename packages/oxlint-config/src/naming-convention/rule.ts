import type { Context, Rule, Scope } from '@oxlint/plugins';

import { type AstNode, getIdentifiersFromPattern, getOuterScope, getScope } from './ast.js';
import { Modifiers } from './enums.js';
import { createTypeInference } from './infer-type.js';
import { createValidators, Messages, type NamingOption, type Validator } from './validator.js';

const DEFAULT_OPTIONS: NamingOption[] = [
	{ format: ['camelCase'], leadingUnderscore: 'allow', selector: 'default', trailingUnderscore: 'allow' },
	{ format: ['camelCase', 'PascalCase'], selector: 'import' },
	{ format: ['camelCase', 'UPPER_CASE'], leadingUnderscore: 'allow', selector: 'variable', trailingUnderscore: 'allow' },
	{ format: ['PascalCase'], selector: 'typeLike' }
];

const functionValues = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'TSEmptyBodyFunctionExpression']);
const identifierPattern = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u;

function getMemberModifiers(node: AstNode) {
	const modifiers = new Set<number>();

	if (node.key?.type === 'PrivateIdentifier') {
		modifiers.add(Modifiers['#private']);
	} else if (node.accessibility) {
		modifiers.add(Modifiers[node.accessibility as 'private' | 'protected' | 'public']);
	} else {
		modifiers.add(Modifiers.public);
	}

	if (node.static) modifiers.add(Modifiers.static);
	if (node.readonly) modifiers.add(Modifiers.readonly);
	if (node.override) modifiers.add(Modifiers.override);
	if (node.type.startsWith('TSAbstract')) modifiers.add(Modifiers.abstract);

	return modifiers;
}

function isDestructured(id: AstNode) {
	return (id.parent?.type === 'Property' && id.parent.shorthand)
		|| (id.parent?.type === 'AssignmentPattern' && id.parent.parent?.type === 'Property' && id.parent.parent.shorthand);
}

function isExported(node: AstNode | null | undefined, name: string, scope: null | Scope) {
	if (node?.parent?.type === 'ExportDefaultDeclaration' || node?.parent?.type === 'ExportNamedDeclaration') return true;

	for (const ref of scope?.set.get(name)?.references ?? []) {
		const refParent = (ref.identifier as unknown as AstNode).parent;

		if (refParent?.type === 'ExportDefaultDeclaration' || refParent?.type === 'ExportSpecifier') return true;
	}

	return false;
}

function isGlobal(scope: null | Scope) {
	return scope?.type === 'global' || scope?.type === 'module';
}

function keyName(key: AstNode): string {
	return key.type === 'Identifier' || key.type === 'PrivateIdentifier' ? key.name : `${key.value}`;
}

export const NamingConvention: Rule = {
	create(context: Context) {
		const options = context.options.length ? context.options as unknown as NamingOption[] : DEFAULT_OPTIONS;
		const validators = createValidators(context, options);
		const { inferDeclaredType, inferMemberType } = createTypeInference(context);

		/** typescript-eslint counts reads; an exported name is used. */
		function isUnused(name: string, scope: null | Scope, node?: AstNode | null) {
			let variable = null;

			for (let current = scope; current && !variable; current = current.upper) variable = current.set.get(name) ?? null;

			if (!variable || isExported(node, name, scope)) return false;

			return !variable.references.some(ref => ref.isRead());
		}

		function handleMember(validator: Validator, node: AstNode, modifiers: Set<number>, typed = false) {
			const key = node.key;

			if (!identifierPattern.test(keyName(key))) modifiers.add(Modifiers.requiresQuotes);

			validator(key, modifiers, typed ? () => inferMemberType(node) : undefined);
		}

		function handleFunctionName(node: AstNode) {
			if (node.id == null) return;

			const modifiers = new Set<number>();
			const scope = getOuterScope(context, node);

			if (isGlobal(scope)) modifiers.add(Modifiers.global);
			if (isExported(node, node.id.name, scope)) modifiers.add(Modifiers.exported);
			if (isUnused(node.id.name, scope, node)) modifiers.add(Modifiers.unused);
			if (node.async) modifiers.add(Modifiers.async);

			validators.function(node.id, modifiers);
		}

		function handleParameters(node: AstNode) {
			for (const param of node.params) {
				if (param.type === 'TSParameterProperty') continue;

				for (const id of getIdentifiersFromPattern(param)) {
					const modifiers = new Set<number>();

					if (isDestructured(id)) modifiers.add(Modifiers.destructured);
					if (isUnused(id.name, getScope(context, id))) modifiers.add(Modifiers.unused);

					validators.parameter(id, modifiers, () => inferDeclaredType(id));
				}
			}
		}

		function handleClassProperty(node: AstNode) {
			if (node.computed) return;

			if (functionValues.has(node.value?.type)) {
				const modifiers = getMemberModifiers(node);

				if (node.value.async) modifiers.add(Modifiers.async);

				handleMember(validators.classMethod, node, modifiers);
			} else {
				handleMember(validators.classProperty, node, getMemberModifiers(node), true);
			}
		}

		function handleMethod(node: AstNode) {
			if (node.computed) return;

			if (node.kind === 'method') {
				const modifiers = getMemberModifiers(node);

				if (node.value?.async) modifiers.add(Modifiers.async);

				handleMember(validators.classMethod, node, modifiers);
			} else if (node.kind === 'get' || node.kind === 'set') {
				handleMember(validators.classicAccessor, node, getMemberModifiers(node), true);
			}
		}

		function handleTypeDeclaration(node: AstNode, validator: Validator, outer: boolean) {
			const modifiers = new Set<number>();
			const scope = outer ? getOuterScope(context, node) : getScope(context, node);

			if (node.abstract) modifiers.add(Modifiers.abstract);
			if (isExported(node, node.id.name, scope)) modifiers.add(Modifiers.exported);
			if (isUnused(node.id.name, scope, node)) modifiers.add(Modifiers.unused);

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
				modifiers.add(Modifiers.default);
			} else if (node.type === 'ImportNamespaceSpecifier') {
				modifiers.add(Modifiers.namespace);
			} else {
				if (node.imported.type === 'Identifier' && node.imported.name !== 'default') return;

				modifiers.add(Modifiers.default);
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
					handleMember(validators.classicAccessor, node, new Set([Modifiers.public]), true);
				} else if (functionValues.has(node.value?.type)) {
					const modifiers = new Set<number>([Modifiers.public]);

					if (node.value.async) modifiers.add(Modifiers.async);

					handleMember(validators.objectLiteralMethod, node, modifiers);
				} else if (node.parent?.type !== 'ObjectPattern') {
					handleMember(validators.objectLiteralProperty, node, new Set([Modifiers.public]), true);
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

				if (!identifierPattern.test(keyName(node.id))) modifiers.add(Modifiers.requiresQuotes);

				validators.enumMember(node.id, modifiers);
			},
			TSInterfaceDeclaration: (node: AstNode) => handleTypeDeclaration(node, validators.interface, false),
			TSMethodSignature(node: AstNode) {
				if (!node.computed) handleMember(validators.typeMethod, node, new Set([Modifiers.public]));
			},
			TSParameterProperty(node: AstNode) {
				const modifiers = getMemberModifiers(node);

				for (const id of getIdentifiersFromPattern(node.parameter)) validators.parameterProperty(id, modifiers, () => inferDeclaredType(id));
			},
			TSPropertySignature(node: AstNode) {
				if (node.computed) return;

				if (node.typeAnnotation?.typeAnnotation?.type === 'TSFunctionType') {
					handleMember(validators.typeMethod, node, new Set([Modifiers.public]));
				} else {
					const modifiers = new Set<number>([Modifiers.public]);

					if (node.readonly) modifiers.add(Modifiers.readonly);

					handleMember(validators.typeProperty, node, modifiers, true);
				}
			},
			TSTypeAliasDeclaration: (node: AstNode) => handleTypeDeclaration(node, validators.typeAlias, false),
			TSTypeParameter(node: AstNode) {
				if (node.parent?.type !== 'TSTypeParameterDeclaration') return;

				const modifiers = new Set<number>();

				if (isUnused(node.name.name, getScope(context, node))) modifiers.add(Modifiers.unused);

				validators.typeParameter(node.name, modifiers);
			},
			VariableDeclarator(node: AstNode) {
				const baseModifiers = new Set<number>();

				if (node.parent?.kind === 'const') baseModifiers.add(Modifiers.const);
				if (isGlobal(getScope(context, node))) baseModifiers.add(Modifiers.global);

				for (const id of getIdentifiersFromPattern(node.id)) {
					const modifiers = new Set(baseModifiers);
					const scope = getScope(context, id);

					if (isDestructured(id)) modifiers.add(Modifiers.destructured);
					if (isExported(node.parent, id.name, scope)) modifiers.add(Modifiers.exported);
					if (isUnused(id.name, scope, node.parent)) modifiers.add(Modifiers.unused);
					if (id === node.id && node.init?.async) modifiers.add(Modifiers.async);

					validators.variable(id, modifiers, () => inferDeclaredType(id));
				}
			}
		} as never;
	},
	meta: {
		docs: {
			description: 'Enforce naming conventions for everything across a codebase (typescript-eslint\'s rule, with types inferred from syntax)'
		},
		messages: Messages,
		schema: { items: { type: 'object' }, type: 'array' },
		type: 'suggestion'
	}
};
