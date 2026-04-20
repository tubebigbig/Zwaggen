import { expect, test } from 'vitest';
import { validate } from '../../src/validator/validate';
import { emptySpec, type Spec, type TypeDef } from '@zwaggen/core';

const spec = (): Spec => emptySpec();

test('primitive pass/fail', () => {
  expect(validate(spec(), { kind: 'string' }, 'hi')).toEqual([]);
  expect(validate(spec(), { kind: 'string' }, 3)).toEqual([
    { path: '', message: 'expected string, got number' },
  ]);
});

test('integer rejects fractional', () => {
  expect(validate(spec(), { kind: 'integer' }, 1.5)[0]!.message).toMatch(/integer/);
});

test('string constraints', () => {
  const t: TypeDef = { kind: 'string', minLength: 2, pattern: '^[a-z]+$' };
  expect(validate(spec(), t, 'a')[0]!.message).toMatch(/minLength/);
  expect(validate(spec(), t, 'AB')[0]!.message).toMatch(/pattern/);
  expect(validate(spec(), t, 'ok')).toEqual([]);
});

test('array element errors carry index in path', () => {
  const t: TypeDef = { kind: 'array', element: { kind: 'number' } };
  expect(validate(spec(), t, [1, 'two', 3])).toEqual([
    { path: '[1]', message: 'expected number, got string' },
  ]);
});

test('object missing required', () => {
  const t: TypeDef = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  expect(validate(spec(), t, {})).toEqual([
    { path: 'id', message: 'missing required field' },
  ]);
});

test('object strict flags unknown', () => {
  const t: TypeDef = { kind: 'object', strict: true, fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  expect(validate(spec(), t, { id: 'x', extra: 1 })).toEqual([
    { path: 'extra', message: 'unknown field' },
  ]);
});

test('union: ok if any variant passes', () => {
  const t: TypeDef = { kind: 'union', variants: [{ kind: 'string' }, { kind: 'number' }] };
  expect(validate(spec(), t, 1)).toEqual([]);
  expect(validate(spec(), t, true)[0]!.message).toMatch(/none of/);
});

test('cyclic ref terminates and validates', () => {
  const s = spec();
  s.types.Tree = {
    kind: 'object',
    fields: [
      { name: 'v', required: true, type: { kind: 'number' } },
      { name: 'children', required: true, type: { kind: 'array', element: { kind: 'ref', ref: 'Tree' } } },
    ],
  };
  const value = { v: 1, children: [{ v: 2, children: [] }] };
  expect(validate(s, { kind: 'ref', ref: 'Tree' }, value)).toEqual([]);
  const bad = { v: 1, children: [{ v: 'two', children: [] }] };
  expect(validate(s, { kind: 'ref', ref: 'Tree' }, bad)).toEqual([
    { path: 'children[0].v', message: 'expected number, got string' },
  ]);
});

test('dangling ref reports error', () => {
  expect(validate(spec(), { kind: 'ref', ref: 'Missing' }, {})[0]!.message).toMatch(/unknown type/);
});
