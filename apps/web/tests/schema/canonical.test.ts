import { describe, it, expect } from 'vitest';
import { canonicalStringify } from '../../src/schema/canonical';
import type { TypeDef } from '../../src/schema/types';

describe('canonicalStringify', () => {
  it('stringifies numbers', () => {
    expect(canonicalStringify(1)).toBe('1');
  });

  it('stringifies strings', () => {
    expect(canonicalStringify('x')).toBe('"x"');
  });

  it('stringifies null', () => {
    expect(canonicalStringify(null)).toBe('null');
  });

  it('stringifies true', () => {
    expect(canonicalStringify(true)).toBe('true');
  });

  it('stringifies false', () => {
    expect(canonicalStringify(false)).toBe('false');
  });

  it('preserves array order', () => {
    expect(canonicalStringify([2, 1])).toBe('[2,1]');
  });

  it('sorts object keys', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('is independent of object key insertion order', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(
      canonicalStringify({ a: 2, b: 1 }),
    );
  });

  it('sorts keys in nested objects', () => {
    expect(canonicalStringify({ x: { b: 1, a: 2 } })).toBe(
      canonicalStringify({ x: { a: 2, b: 1 } }),
    );
  });

  it('sorts keys inside arrays of objects', () => {
    expect(canonicalStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('skips undefined properties', () => {
    expect(canonicalStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('produces equal canonical strings for TypeDef shapes with differently-ordered keys', () => {
    const a: TypeDef = { kind: 'string', minLength: 1, description: 'x' };
    const b = { description: 'x', minLength: 1, kind: 'string' } as TypeDef;
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });
});
