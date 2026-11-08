import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

export type MessageIds = 'castWhere' | 'inlineFilterShape' | 'untypedFilterVariable';

export type Options = [];

/** Type names that declare a filter as "any keys at all", which is no filter type at all. */
const escapeHatchTypeNames = new Set(['AnyObject', 'Object', 'Record']);

/** The utility types a filter is derived from instead of being declared over a model. */
const signatureDerivedTypeNames = new Set(['Parameters', 'ReturnType']);

/** The keywords that erase the filter type rather than narrow it. */
const wideKeywordTypes = new Set(['TSAnyKeyword', 'TSNeverKeyword', 'TSObjectKeyword', 'TSUnknownKeyword']);

/**
 * True when asserting `type` leaves nothing of the filter checked.
 *
 * `never`, `any`, `unknown` and `object` say outright that no path is compared, and a
 * type read off a repository signature (`Parameters<typeof this.find>[0]['where']`) is
 * the same erasure spelled as a derivation: it resolves to the filter the method
 * accepts, which every object satisfies once the literal is cast rather than checked.
 *
 * Naming a model does not rescue the cast; see {@link isUncheckableCast} for the line
 * that decides that.
 *
 * `aliasedBy` resolves a name declared as a type alias in the same file, so naming the
 * derivation (`type ProductWhere = Parameters<…>[0]['where']`) does not hide it.
 */
function isErasingType(type: TSESTree.TypeNode, aliasedBy: (name: string) => TSESTree.TypeNode | undefined): boolean {
	if (wideKeywordTypes.has(type.type)) return true;

	if (type.type === 'TSIndexedAccessType') return isErasingType(type.objectType, aliasedBy);

	const name = typeReferenceName(type);

	if (name === undefined || type.type !== 'TSTypeReference') return false;
	if (signatureDerivedTypeNames.has(name) || escapeHatchTypeNames.has(name)) return true;

	const params = type.typeArguments?.params ?? [];

	// `ObjFilter<any>` and `ObjFilter<AnyObject>` name a filter over anything, which is
	// the erasure again with a filter type wrapped round it.
	if (name === 'ObjFilter') {
		return params.length > 0
			&& params.every(param => wideKeywordTypes.has(param.type) || escapeHatchTypeNames.has(typeReferenceName(param) ?? ''));
	}

	if (params.length === 0) {
		// `aliasedBy` answers once per name: a self-referential alias would otherwise
		// recur forever, and ESLint would hang rather than report anything.
		const aliased = aliasedBy(name);

		return aliased !== undefined && isErasingType(aliased, seen => (seen === name ? undefined : aliasedBy(seen)));
	}

	// Through a wrapper the derivation is usually written in — `NonNullable<Parameters<…>>`.
	return params.some(param => isErasingType(param, aliasedBy));
}

/**
 * True when `annotation` lets the filter hold any key at all — `AnyObject`,
 * `Record<string, unknown>`, `any`, `object`, `unknown`. `ObjFilter<T>` declares a
 * signature per field path, so none of these is a narrowing of it: they are what a
 * filter is annotated with when the model's own type was too much trouble.
 */
function isEscapeHatchAnnotation(annotation: TSESTree.TypeNode): boolean {
	if (annotation.type === 'TSAnyKeyword' || annotation.type === 'TSObjectKeyword' || annotation.type === 'TSUnknownKeyword') return true;

	const name = typeReferenceName(annotation);

	return name !== undefined && escapeHatchTypeNames.has(name);
}

/** True when the variable's name says it holds a filter: `where`, `entityWhere`, `curWhere`. */
function isFilterName(name: string): boolean {
	return /where$/iu.test(name);
}

/** True when `type` names a filter over a shape written here rather than over a model. */
function isInlineFilterShape(type: TSESTree.TypeNode): boolean {
	return typeReferenceName(type) === 'ObjFilter'
		&& type.type === 'TSTypeReference'
		&& type.typeArguments?.params[0]?.type === 'TSTypeLiteral';
}

/** True when `reference` hands the variable to a call as its `where` clause. */
function isPassedAsWhere(reference: TSESTree.Identifier): boolean {
	const { parent } = reference;

	if (parent.type !== 'Property' || parent.computed) return false;

	// Shorthand `{ context, where }` and explicit `{ where: curWhere }` are the same handoff.
	return keyNameOf(parent) === 'where' && (parent.shorthand || parent.value === reference);
}

/**
 * True when `name` is a type parameter in scope at `node` — the `T` of a repository
 * generic over its schema, or of a scope plugin that works on any of them.
 *
 * Read off the enclosing declarations rather than from type information: a function,
 * class, interface or alias lists its own parameters, and a name that matches one of
 * them is not a model this file could have named instead.
 */
function isTypeParameterName(node: TSESTree.Node, name: string): boolean {
	for (let scope: TSESTree.Node | undefined = node; scope; scope = scope.parent) {
		const declared = 'typeParameters' in scope ? scope.typeParameters : undefined;

		if (declared?.type === 'TSTypeParameterDeclaration'
			&& declared.params.some(param => param.name.name === name)) {
			return true;
		}
	}

	return false;
}

/**
 * True when `node` asserts a type over a value whose keys this file just wrote, so the
 * assertion can only be switching the per-key check off.
 *
 * This is the line between a cast that makes a claim and one that makes none. A cast on a
 * value from OUTSIDE — `input.where as ObjFilter<PrivateUser>` at a tRPC edge, where the
 * wire type cannot be an `ObjFilter` — is a claim about which collection the filter is
 * for, and a reviewer can check it against the repository beside it. A cast on a FRESH
 * OBJECT LITERAL claims nothing: the collection is already fixed by the repository the
 * clause is handed to, so naming it again adds no information, and `as` on a literal only
 * asks for overlap. Every key of `ObjFilter` is optional, so nothing is compared.
 *
 * The exception is a type argument that is a type parameter: `{} as ObjFilter<T>` in a
 * scope plugin, or `{ _id: id } as ObjFilter<z.infer<T>>` in the engine, has no model to
 * name but its own parameter, and no annotation can be written in its place.
 */
function isUncheckableCast(node: TSESTree.TSAsExpression): boolean {
	// `as const` narrows the literal rather than relaxing it, so it is not this cast. It
	// parses as a reference to the name `const`, not as a type operator.
	if (typeReferenceName(node.typeAnnotation) === 'const') return false;

	return node.expression.type === 'ObjectExpression' && !namesATypeParameter(node.typeAnnotation, node);
}

/**
 * True when `node` reaches a repository as a where clause.
 *
 * A filter is often assembled before it is passed, so the position follows the
 * assembly: through the `where:` key itself, through the declarator of a
 * `where`/`*Where` variable, and through the spreads, branches and `$`-operator
 * arrays that merge fragments into one clause — a cast on one `$or` arm erases the
 * checking of its keys just as completely as a cast on the whole clause.
 */
function isWherePosition(node: TSESTree.Node): boolean {
	if (isWhereProperty(node)) return true;

	const { parent } = node;

	if (parent === undefined) return false;

	if (parent.type === 'VariableDeclarator') {
		return parent.init === node && parent.id.type === 'Identifier' && isFilterName(parent.id.name);
	}

	if (parent.type === 'SpreadElement') {
		return parent.parent.type === 'ObjectExpression' && isWherePosition(parent.parent);
	}

	// A clause inside `$or`/`$and`/`$nor` is still the clause: rule 10 applies inside a
	// logical operator too, and without this the cast just moves one level in.
	if (parent.type === 'ArrayExpression') {
		return parent.parent.type === 'Property'
			&& !parent.parent.computed
			&& (keyNameOf(parent.parent) ?? '').startsWith('$')
			&& isWherePosition(parent.parent.parent);
	}

	if (parent.type === 'ConditionalExpression') {
		return (parent.consequent === node || parent.alternate === node) && isWherePosition(parent);
	}

	if (parent.type === 'LogicalExpression') {
		return parent.right === node && isWherePosition(parent);
	}

	// `x as unknown as ObjFilter<…>` and `(x as never)!`: the outer wrapper is what
	// sits in the where position, and the inner expression is in it too.
	if (parent.type === 'TSAsExpression' || parent.type === 'TSNonNullExpression' || parent.type === 'TSSatisfiesExpression') {
		return isWherePosition(parent);
	}

	return false;
}

/** True when `node` is the value of a `where:` property, written bare or quoted. */
function isWhereProperty(node: TSESTree.Node): boolean {
	const { parent } = node;

	return parent !== undefined && parent.type === 'Property' && parent.value === node && keyNameOf(parent) === 'where';
}

/** Reads a non-computed property's key, whether it is written bare or quoted. */
function keyNameOf(property: TSESTree.Property): string | undefined {
	if (property.computed) return undefined;
	if (property.key.type === 'Identifier') return property.key.name;

	return typeof property.key.value === 'string' ? property.key.value : undefined;
}

/** True when `type` mentions a type parameter in scope, at any depth of its arguments. */
function namesATypeParameter(type: TSESTree.TypeNode, at: TSESTree.Node): boolean {
	const name = typeReferenceName(type);

	if (name !== undefined && isTypeParameterName(at, name)) return true;

	if (type.type === 'TSIndexedAccessType') return namesATypeParameter(type.objectType, at);
	if (type.type === 'TSTypeQuery') return false;

	const params = type.type === 'TSTypeReference' ? type.typeArguments?.params ?? [] : [];

	return params.some(param => namesATypeParameter(param, at));
}

/** The last segment of a type reference's name, so a namespaced import reads the same. */
function typeReferenceName(type: TSESTree.TypeNode): string | undefined {
	if (type.type !== 'TSTypeReference') return undefined;
	if (type.typeName.type === 'Identifier') return type.typeName.name;

	return type.typeName.type === 'TSQualifiedName' ? type.typeName.right.name : undefined;
}

/**
 * Requires a where clause to be typed as `ObjFilter` over the whole model
 * (repository rule 10).
 *
 * `ObjFilter<z.infer<typeof Model>>` declares a signature per field path of the
 * stored model, dotted join paths included, so the filter is checked against what
 * the collection actually holds. Every way of getting out of that check compiles
 * and then answers the wrong question at runtime: a cast to `never` or to a type
 * derived from a repository signature turns a renamed field into a filter that
 * matches nothing, a filter built over a partial or hand-written shape checks the
 * keys you declared instead of the ones the collection stores, and an `AnyObject`
 * accumulator checks nothing at all. None of them fails a spec — the query is
 * valid Mongo, it simply selects no rows, so the sweep or the count silently reads
 * as zero.
 *
 * Only the casts that make no claim are flagged. A cast whose operand is a fresh object
 * literal always makes none — the collection is fixed by the repository the clause is
 * handed to — so it is flagged whatever type it names; see {@link isUncheckableCast}. A
 * cast over a value from outside is left to the reviewer unless the type it asserts
 * erases the filter outright; see {@link isErasingType}.
 */
export default ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
	create(context) {
		const aliases = new Map<string, TSESTree.TypeNode>();
		const aliasedBy = (name: string) => aliases.get(name);

		return {
			// Collected on the way in, so a cast reads an alias declared below it too:
			// ESLint walks a file top to bottom, and a type alias hoists.
			Program(node) {
				for (const statement of node.body) {
					const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

					if (declaration?.type === 'TSTypeAliasDeclaration') aliases.set(declaration.id.name, declaration.typeAnnotation);
				}
			},

			TSAsExpression(node) {
				// Only the outermost cast of a `x as unknown as ObjFilter<…>` chain reports,
				// so a double cast is one problem rather than two.
				if (node.parent.type === 'TSAsExpression') return;

				// Widening through `unknown` and then naming a type is the erasure too: the
				// literal is compared against `unknown`, never against the model.
				const isErased = isErasingType(node.typeAnnotation, aliasedBy)
					|| (node.expression.type === 'TSAsExpression' && isErasingType(node.expression.typeAnnotation, aliasedBy));

				if (isWherePosition(node)) {
					if (isErased || isUncheckableCast(node)) context.report({ messageId: 'castWhere', node });

					return;
				}

				// `{ context, where: x } as never` erases the clause by way of the options
				// object, which is the same hole one step out. Only an ERASING cast counts
				// here: one step out the object is no longer the clause, so a cast naming a
				// real type is a claim about the options rather than about the filter.
				const isCastOnOptionsHoldingWhere = node.expression.type === 'ObjectExpression'
					&& node.expression.properties.some(property => property.type === 'Property' && keyNameOf(property) === 'where');

				if (isErased && isCastOnOptionsHoldingWhere) context.report({ messageId: 'castWhere', node });
			},

			TSTypeReference(node) {
				if (isInlineFilterShape(node)) context.report({ messageId: 'inlineFilterShape', node });
			},

			VariableDeclarator(node) {
				if (node.id.type !== 'Identifier' || !isFilterName(node.id.name)) return;

				const annotation = node.id.typeAnnotation?.typeAnnotation;

				if (!annotation || !isEscapeHatchAnnotation(annotation)) return;

				// Only when it is actually used as a clause: a variable named `where` that
				// goes somewhere else is not this rule's business.
				const variable = context.sourceCode.getDeclaredVariables(node)[0];

				if (!variable?.references.some(reference => isPassedAsWhere(reference.identifier as TSESTree.Identifier))) return;

				context.report({ messageId: 'untypedFilterVariable', node: annotation });
			}
		};
	},
	defaultOptions: [],
	meta: {
		docs: {
			description:
				'Require a where clause to be typed as ObjFilter over the whole model, rather than cast, derived from a repository signature, or built over a partial shape.'
		},
		messages: {
			castWhere:
				'This cast leaves the where clause checked against nothing, so a renamed field or a mistyped join path compiles and then matches no rows. Naming the model does not help: `as` on a literal you just wrote only asks for overlap, and every key of `ObjFilter` is optional. Annotate it `ObjFilter<z.infer<typeof Model>>` (`import type { ObjFilter } from \'mongo-typed\'`) or `satisfies` it — never derive the type from a repository signature — and filter a join through its model path (`{ \'roles._id\': { $in: ids } }`), which `processWhere` rewrites operators included. An ordinary repository or router has no excuse. A migration reading a field the model no longer declares, or a utility spanning arbitrary repository schemas, does: disable this rule on the line and say which boundary it is.',
			inlineFilterShape:
				'A filter over an inline shape checks the keys declared here, not the ones the collection stores, so a renamed field or a join path goes unchecked. Write `ObjFilter<z.infer<typeof Model>>` over the whole model.',
			untypedFilterVariable:
				'A where clause annotated as any-keys-at-all is checked against nothing, and assembling it in an accumulator is also what loses the contextual typing that would have checked it. Build it as one object literal typed `ObjFilter<z.infer<typeof Model>>`, with conditional spreads for the optional filters. An ordinary repository or router has no excuse. A repository reached by name at runtime, or any other utility spanning arbitrary repository schemas, does: disable this rule on the line and say so.'
		},
		schema: [],
		type: 'problem'
	}
});
