import { describe, expect, test } from 'vitest';
import { collectInheritanceCycles, wouldCreateCycle } from '../../src/schema/cycles';
import type { Spec, ObjectType } from '../../src/schema/types';
import { emptySpec } from '../../src/schema/defaults';

function mkSpec(types: Record<string, ObjectType>): Spec {
  return { ...emptySpec(), types };
}

describe('collectInheritanceCycles', () => {
  test('no cycles returns empty', () => {
    const spec = mkSpec({
      A: { kind: 'object', fields: [] },
      B: { kind: 'object', extends: ['A'], fields: [] },
    });
    expect(collectInheritanceCycles(spec)).toEqual([]);
  });

  test('direct cycle', () => {
    const spec = mkSpec({
      A: { kind: 'object', extends: ['B'], fields: [] },
      B: { kind: 'object', extends: ['A'], fields: [] },
    });
    const cycles = collectInheritanceCycles(spec);
    expect(cycles.length).toBeGreaterThan(0);
    const cycle = cycles[0]!;
    expect(cycle.cycle).toContain('A');
    expect(cycle.cycle).toContain('B');
  });

  test('indirect (3-step) cycle', () => {
    const spec = mkSpec({
      A: { kind: 'object', extends: ['B'], fields: [] },
      B: { kind: 'object', extends: ['C'], fields: [] },
      C: { kind: 'object', extends: ['A'], fields: [] },
    });
    const cycles = collectInheritanceCycles(spec);
    expect(cycles.length).toBeGreaterThan(0);
  });

  test('self-reference is a cycle', () => {
    const spec = mkSpec({
      A: { kind: 'object', extends: ['A'], fields: [] },
    });
    const cycles = collectInheritanceCycles(spec);
    expect(cycles[0]!.cycle).toContain('A');
  });
});

describe('wouldCreateCycle', () => {
  test('adding a parent that would form a cycle returns true', () => {
    const spec = mkSpec({
      A: { kind: 'object', fields: [] },
      B: { kind: 'object', extends: ['A'], fields: [] },
    });
    // A wants to extend B → cycle (B already extends A).
    expect(wouldCreateCycle(spec, 'A', 'B')).toBe(true);
  });

  test('adding a non-cycle parent returns false', () => {
    const spec = mkSpec({
      A: { kind: 'object', fields: [] },
      B: { kind: 'object', fields: [] },
    });
    expect(wouldCreateCycle(spec, 'A', 'B')).toBe(false);
  });

  test('self-parent is always a cycle', () => {
    const spec = mkSpec({ A: { kind: 'object', fields: [] } });
    expect(wouldCreateCycle(spec, 'A', 'A')).toBe(true);
  });
});
