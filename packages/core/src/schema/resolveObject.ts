import type { Spec, ObjectType, ObjectField } from './types';

export class InheritanceCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Inheritance cycle detected: ${cycle.join(' → ')}`);
  }
}

/**
 * Flatten an ObjectType's inheritance chain into a single effective ObjectType.
 *
 * Precedence:
 *  - Parents are merged left-to-right in `extends` declaration order.
 *    A later parent's field with the same name overrides an earlier parent's.
 *  - Diamond inheritance: a parent visited via two paths is merged only once;
 *    we track visited type keys and skip revisits.
 *  - Child (the starting type) overrides all parent fields.
 *  - `strict` on the effective type is the OR across the whole chain.
 *  - Missing or non-object parents are silently skipped — the validator /
 *    broken-ref collector is the surface that flags them for the user.
 *
 * Throws `InheritanceCycleError` if a cycle is detected. Cycles should have
 * been caught by `collectInheritanceCycles` before this runs; the throw is
 * defense-in-depth.
 */
export function resolveObject(spec: Spec, key: string): ObjectType {
  const start = spec.types[key];
  if (!start || start.kind !== 'object') {
    throw new Error(`resolveObject: type '${key}' not found or not an object`);
  }
  const visited = new Set<string>();
  const byName = new Map<string, ObjectField>();
  let strict = false;

  function walk(k: string, stack: string[]): void {
    if (stack.includes(k)) {
      throw new InheritanceCycleError([...stack.slice(stack.indexOf(k)), k]);
    }
    if (visited.has(k)) return;
    visited.add(k);
    const t = spec.types[k];
    if (!t || t.kind !== 'object') return;
    // Depth-first: merge parent chain first (left-to-right), so current type's
    // fields get a chance to override after all ancestors are merged.
    const parents = t.extends ?? [];
    for (const p of parents) walk(p, [...stack, k]);
    if (t.strict) strict = true;
    for (const f of t.fields) byName.set(f.name, f);
  }

  walk(key, []);

  const fields: ObjectField[] = [...byName.values()];
  const out: ObjectType = { kind: 'object', fields };
  if (strict) out.strict = true;
  if (start.description) out.description = start.description;
  if (start.example !== undefined) out.example = start.example;
  return out;
}
