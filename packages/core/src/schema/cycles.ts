import type { Spec } from './types';

export interface CycleReport {
  /** The type key where the cycle was first observed. */
  type: string;
  /** The cycle path, e.g. ['A', 'B', 'C', 'A']. */
  cycle: string[];
}

/**
 * Walk every type's extends chain. Any chain that revisits a node on its path
 * is reported. Each distinct cycle is reported once, keyed by its minimum
 * starting node.
 */
export function collectInheritanceCycles(spec: Spec): CycleReport[] {
  const reported = new Set<string>();
  const out: CycleReport[] = [];
  for (const key of Object.keys(spec.types)) {
    const path: string[] = [];
    visit(spec, key, path, (cyc) => {
      const id = canonicalCycleId(cyc);
      if (reported.has(id)) return;
      reported.add(id);
      out.push({ type: cyc[0]!, cycle: cyc });
    });
  }
  return out;
}

/**
 * True if setting `candidateParent` as a new parent of `childKey` would form
 * a cycle. Does NOT mutate the spec. Used at picker commit time to reject
 * bad selections before the user sees a broken type.
 */
export function wouldCreateCycle(spec: Spec, childKey: string, candidateParent: string): boolean {
  if (childKey === candidateParent) return true;
  // A cycle exists iff the candidate parent's chain reaches childKey.
  // Walk the parent's chain; if we see childKey, it's a cycle.
  const visited = new Set<string>();
  function reaches(node: string): boolean {
    if (node === childKey) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    const t = spec.types[node];
    if (!t || t.kind !== 'object') return false;
    const parents = t.extends ?? [];
    for (const p of parents) if (reaches(p)) return true;
    return false;
  }
  return reaches(candidateParent);
}

function visit(
  spec: Spec,
  key: string,
  path: string[],
  report: (cycle: string[]) => void,
): void {
  const idx = path.indexOf(key);
  if (idx >= 0) {
    report([...path.slice(idx), key]);
    return;
  }
  const t = spec.types[key];
  if (!t || t.kind !== 'object') return;
  const parents = t.extends ?? [];
  const next = [...path, key];
  for (const p of parents) visit(spec, p, next, report);
}

function canonicalCycleId(cycle: string[]): string {
  // Rotate to start at the lexicographically smallest member so
  // ['A','B','C','A'] and ['B','C','A','B'] hash identically.
  const closed = cycle.slice(0, -1); // drop the repeated tail
  let minIdx = 0;
  for (let i = 1; i < closed.length; i++) {
    if (closed[i]! < closed[minIdx]!) minIdx = i;
  }
  return [...closed.slice(minIdx), ...closed.slice(0, minIdx)].join('>');
}
