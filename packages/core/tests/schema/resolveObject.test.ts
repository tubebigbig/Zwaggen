import { describe, expect, test } from 'vitest';
import { resolveObject, InheritanceCycleError } from '../../src/schema/resolveObject';
import type { Spec, ObjectType } from '../../src/schema/types';
import { emptySpec } from '../../src/schema/defaults';

function mkSpec(types: Record<string, ObjectType>): Spec {
  return { ...emptySpec(), types };
}

describe('resolveObject', () => {
  test('no extends returns the type as-is', () => {
    const spec = mkSpec({
      User: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
    });
    const out = resolveObject(spec, 'User');
    expect(out.fields).toEqual((spec.types.User! as ObjectType).fields);
    expect(out.extends).toBeUndefined();
  });

  test('single parent: child inherits parent fields', () => {
    const spec = mkSpec({
      Base: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
      User: { kind: 'object', extends: ['Base'], fields: [{ name: 'name', required: true, type: { kind: 'string' } }] },
    });
    const out = resolveObject(spec, 'User');
    expect(out.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(out.extends).toBeUndefined(); // flattened
  });

  test('child override: child field replaces parent field with the same name', () => {
    const spec = mkSpec({
      Base: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
      User: { kind: 'object', extends: ['Base'], fields: [{ name: 'id', required: true, type: { kind: 'integer' } }] },
    });
    const out = resolveObject(spec, 'User');
    expect(out.fields.length).toBe(1);
    expect(out.fields[0]!.type).toEqual({ kind: 'integer' });
  });

  test('multi-parent precedence: later parents override earlier; child overrides all', () => {
    const spec = mkSpec({
      A: { kind: 'object', fields: [{ name: 'x', required: true, type: { kind: 'string' } }, { name: 'y', required: true, type: { kind: 'string' } }] },
      B: { kind: 'object', fields: [{ name: 'y', required: true, type: { kind: 'integer' } }, { name: 'z', required: true, type: { kind: 'string' } }] },
      Foo: { kind: 'object', extends: ['A', 'B'], fields: [{ name: 'z', required: true, type: { kind: 'boolean' } }, { name: 'w', required: true, type: { kind: 'string' } }] },
    });
    const out = resolveObject(spec, 'Foo');
    const byName = Object.fromEntries(out.fields.map((f) => [f.name, f.type]));
    expect(byName.x).toEqual({ kind: 'string' }); // from A
    expect(byName.y).toEqual({ kind: 'integer' }); // B overrides A
    expect(byName.z).toEqual({ kind: 'boolean' }); // child overrides B
    expect(byName.w).toEqual({ kind: 'string' }); // child adds
  });

  test('diamond inheritance: Base merged once, first-visit-wins on path', () => {
    const spec = mkSpec({
      Base: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
      L: { kind: 'object', extends: ['Base'], fields: [] },
      R: { kind: 'object', extends: ['Base'], fields: [] },
      Foo: { kind: 'object', extends: ['L', 'R'], fields: [] },
    });
    const out = resolveObject(spec, 'Foo');
    expect(out.fields.map((f) => f.name)).toEqual(['id']);
  });

  test('strict is OR across the chain', () => {
    const spec = mkSpec({
      Base: { kind: 'object', strict: true, fields: [] },
      User: { kind: 'object', extends: ['Base'], fields: [] },
    });
    expect(resolveObject(spec, 'User').strict).toBe(true);
  });

  test('missing parent is skipped (warning suppressed, resolver defensive)', () => {
    const spec = mkSpec({
      User: { kind: 'object', extends: ['Missing'], fields: [{ name: 'name', required: true, type: { kind: 'string' } }] },
    });
    const out = resolveObject(spec, 'User');
    expect(out.fields.map((f) => f.name)).toEqual(['name']);
  });

  test('non-object parent is skipped', () => {
    const spec = mkSpec({
      User: { kind: 'object', extends: ['SomeString'], fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
    });
    (spec.types as any).SomeString = { kind: 'string' };
    const out = resolveObject(spec, 'User');
    expect(out.fields.map((f) => f.name)).toEqual(['id']);
  });

  test('cycle throws InheritanceCycleError', () => {
    const spec = mkSpec({
      A: { kind: 'object', extends: ['B'], fields: [] },
      B: { kind: 'object', extends: ['A'], fields: [] },
    });
    expect(() => resolveObject(spec, 'A')).toThrow(InheritanceCycleError);
  });

  test('resolving a non-existent or non-object key throws', () => {
    const spec = mkSpec({});
    expect(() => resolveObject(spec, 'NoSuch')).toThrow(/not found/i);
  });
});
