import type { Context, Scope, Variable } from '@oxlint/plugins';

/**
 * Oxlint's AST is TS-ESTree shaped, but its typed nodes are a wide union keyed by oxc's own names
 * (`BindingIdentifier`, `IdentifierReference`). This rule only reads fields by node `type`, so it
 * walks nodes structurally.
 */
export interface AstNode {
	[field: string]: any,
	parent?: AstNode | null,
	type: string
}

/** The identifiers a binding pattern declares, as typescript-eslint's `PatternVisitor` finds them. */
export function getIdentifiersFromPattern(pattern: AstNode | null | undefined, found: AstNode[] = []): AstNode[] {
	switch (pattern?.type) {
		case 'ArrayPattern':
			for (const element of pattern.elements) getIdentifiersFromPattern(element, found);
			break;
		case 'AssignmentPattern':
			getIdentifiersFromPattern(pattern.left, found);
			break;
		case 'Identifier':
			found.push(pattern);
			break;
		case 'ObjectPattern':
			for (const property of pattern.properties) getIdentifiersFromPattern(property.type === 'RestElement' ? property : property.value, found);
			break;
		case 'RestElement':
			getIdentifiersFromPattern(pattern.argument, found);
			break;
	}

	return found;
}

/** The scope a declaration's name lives in, whether or not the declaration opens its own scope. */
export function getOuterScope(context: Context, node: AstNode): null | Scope {
	const scope = getScope(context, node);

	return (scope.block as unknown) === node ? scope.upper : scope;
}

export function getScope(context: Context, node: AstNode): Scope {
	return context.sourceCode.getScope(node as never);
}

/** Whether an identifier names the global built-in rather than something declared in the file. */
export function isBuiltIn(context: Context, identifier: AstNode) {
	return !resolveVariable(context, identifier)?.defs.length;
}

/** The variable an identifier refers to, looked up through the enclosing scopes. */
export function resolveVariable(context: Context, identifier: AstNode): null | Variable {
	for (let scope: null | Scope = getScope(context, identifier); scope; scope = scope.upper) {
		const variable = scope.set.get(identifier.name);

		if (variable) return variable;
	}

	return null;
}
