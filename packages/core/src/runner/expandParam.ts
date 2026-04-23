import type { Spec, ParamDef, TypeDef, ObjectType } from '../schema/types';

function resolveToObject(type: TypeDef, spec: Spec): ObjectType | null {
  if (type.kind === 'object') return type;
  if (type.kind === 'ref') {
    const target = spec.types[type.ref];
    if (target?.kind === 'object') return target;
  }
  return null;
}

/**
 * Expand an object-typed ParamDef into one synthetic ParamDef per field
 * (form/explode semantics — matches OpenAPI 3 default for object-typed
 * query and header params). Refs are dereferenced via `spec.types`.
 *
 * Non-object params pass through unchanged.
 *
 * Only one level of expansion: nested object fields keep their type
 * verbatim and the UI/runner stringifies their values.
 *
 * Each expanded field is required only if BOTH the param and the field
 * are required — an optional param can never produce required sub-fields.
 */
export function expandParam(param: ParamDef, spec: Spec): ParamDef[] {
  const obj = resolveToObject(param.type, spec);
  if (!obj) return [param];
  return obj.fields.map((f) => ({
    name: f.name,
    required: f.required && param.required,
    type: f.type,
    description: f.description,
  }));
}
