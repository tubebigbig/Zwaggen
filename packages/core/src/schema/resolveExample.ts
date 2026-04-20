import type { Spec, TypeDef } from './types';
import { resolveObject } from './resolveObject';

export function resolveExample(spec: Spec, t: TypeDef): unknown | undefined {
  const seen = new Set<string>();
  let cur: TypeDef | undefined = t;
  while (cur) {
    if (cur.kind === 'ref') {
      if (seen.has(cur.ref)) return undefined;
      seen.add(cur.ref);
      const target: TypeDef | undefined = spec.types[cur.ref];
      // If the ref target is an object with extends, substitute with the flattened
      // shape so downstream code sees the effective type. resolveObject throws
      // InheritanceCycleError on cycles; we swallow it and treat as undefined so
      // resolveExample stays defensive (cycles are surfaced by validators elsewhere).
      if (target && target.kind === 'object' && target.extends && target.extends.length > 0) {
        let resolved: TypeDef;
        try {
          resolved = resolveObject(spec, cur.ref);
        } catch {
          return undefined;
        }
        // The flattened shape strips `extends`; if it has no own example, fall
        // back to walking the original parents left-to-right so inherited
        // examples remain discoverable.
        if (resolved.kind === 'object' && resolved.example === undefined) {
          for (const parent of target.extends) {
            const parentExample = resolveExample(spec, { kind: 'ref', ref: parent });
            if (parentExample !== undefined) return parentExample;
          }
        }
        cur = resolved;
        continue;
      }
      cur = target;
      continue;
    }
    if (cur.kind === 'object' || cur.kind === 'array') return cur.example;
    return undefined;
  }
  return undefined;
}
