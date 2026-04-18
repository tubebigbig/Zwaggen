import type { Spec, TypeDef } from './types';

export function resolveExample(spec: Spec, t: TypeDef): unknown | undefined {
  const seen = new Set<string>();
  let cur: TypeDef | undefined = t;
  while (cur) {
    if (cur.kind === 'ref') {
      if (seen.has(cur.ref)) return undefined;
      seen.add(cur.ref);
      cur = spec.types[cur.ref];
      continue;
    }
    if (cur.kind === 'object' || cur.kind === 'array') return cur.example;
    return undefined;
  }
  return undefined;
}
