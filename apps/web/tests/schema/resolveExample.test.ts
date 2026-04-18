import { describe, it, expect } from 'vitest';
import { resolveExample } from '../../src/schema/resolveExample';
import type { Spec, TypeDef } from '../../src/schema/types';
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/types';

function makeSpec(types: Record<string, TypeDef> = {}): Spec {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    info: { name: 'test' },
    types,
    environments: { default: { variables: [] } },
    activeEnvironment: 'default',
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [],
  };
}

describe('resolveExample', () => {
  it('direct object with example returns the example', () => {
    const spec = makeSpec();
    const t: TypeDef = { kind: 'object', fields: [], example: { id: 1, name: 'Alice' } };
    expect(resolveExample(spec, t)).toEqual({ id: 1, name: 'Alice' });
  });

  it('direct array with example returns the example', () => {
    const spec = makeSpec();
    const t: TypeDef = { kind: 'array', element: { kind: 'string' }, example: ['a', 'b'] };
    expect(resolveExample(spec, t)).toEqual(['a', 'b']);
  });

  it('string type returns undefined', () => {
    const spec = makeSpec();
    expect(resolveExample(spec, { kind: 'string' })).toBeUndefined();
  });

  it('number type returns undefined', () => {
    const spec = makeSpec();
    expect(resolveExample(spec, { kind: 'number' })).toBeUndefined();
  });

  it('boolean type returns undefined', () => {
    const spec = makeSpec();
    expect(resolveExample(spec, { kind: 'boolean' })).toBeUndefined();
  });

  it('null type returns undefined', () => {
    const spec = makeSpec();
    expect(resolveExample(spec, { kind: 'null' })).toBeUndefined();
  });

  it('literal type returns undefined', () => {
    const spec = makeSpec();
    expect(resolveExample(spec, { kind: 'literal', value: 42 })).toBeUndefined();
  });

  it('union type returns undefined', () => {
    const spec = makeSpec();
    expect(resolveExample(spec, { kind: 'union', variants: [{ kind: 'string' }] })).toBeUndefined();
  });

  it('single-step ref resolves to target example', () => {
    const spec = makeSpec({
      User: { kind: 'object', fields: [], example: { id: 'u_1' } },
    });
    expect(resolveExample(spec, { kind: 'ref', ref: 'User' })).toEqual({ id: 'u_1' });
  });

  it('chained refs (A→B→C) resolve to C\'s example', () => {
    const spec = makeSpec({
      A: { kind: 'ref', ref: 'B' },
      B: { kind: 'ref', ref: 'C' },
      C: { kind: 'object', fields: [], example: { chained: true } },
    });
    expect(resolveExample(spec, { kind: 'ref', ref: 'A' })).toEqual({ chained: true });
  });

  it('cycle (A→B→A) returns undefined', () => {
    const spec = makeSpec({
      A: { kind: 'ref', ref: 'B' },
      B: { kind: 'ref', ref: 'A' },
    });
    expect(resolveExample(spec, { kind: 'ref', ref: 'A' })).toBeUndefined();
  });

  it('missing ref target returns undefined', () => {
    const spec = makeSpec();
    expect(resolveExample(spec, { kind: 'ref', ref: 'NonExistent' })).toBeUndefined();
  });

  it('object without example returns undefined', () => {
    const spec = makeSpec();
    const t: TypeDef = { kind: 'object', fields: [] };
    expect(resolveExample(spec, t)).toBeUndefined();
  });
});
