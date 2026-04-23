import type { Spec, ObjectType, RefType, ObjectField } from '../schema/types';

/**
 * Return the resolved fields list for a v7 query/header param target.
 *
 * - `undefined` → `[]` (no params).
 * - inline `ObjectType` → its `fields` directly.
 * - `RefType` → looks up `spec.types[ref]`; throws if missing or not an object.
 *
 * Keeps every consumer (RunPanel, codegen, OpenAPI exporter) on the same
 * single helper so the schema-vs-runtime gap stays one function wide.
 */
export function resolveParamFields(
  target: ObjectType | RefType | undefined,
  spec: Spec,
): ObjectField[] {
  if (!target) return [];
  if (target.kind === 'object') return target.fields;
  if (target.kind === 'ref') {
    const t = spec.types[target.ref];
    if (!t) {
      throw new Error(`resolveParamFields: ref "${target.ref}" not in spec.types`);
    }
    if (t.kind !== 'object') {
      throw new Error(
        `resolveParamFields: ref "${target.ref}" resolves to ${t.kind}, expected object`,
      );
    }
    return t.fields;
  }
  return [];
}
