import { describe, expect, test } from 'vitest';
import { resolveParamFields } from '../../src/runner/resolveParamFields';
import { emptySpec } from '../../src/schema/defaults';
import type { Spec } from '../../src/schema/types';

describe('resolveParamFields', () => {
  test('returns [] for undefined target', () => {
    expect(resolveParamFields(undefined, emptySpec())).toEqual([]);
  });

  test('returns the inline object\'s fields directly', () => {
    const target = {
      kind: 'object' as const,
      fields: [
        { name: 'a', required: true, type: { kind: 'string' as const } },
      ],
    };
    expect(resolveParamFields(target, emptySpec())).toEqual(target.fields);
  });

  test('resolves a ref to an object type', () => {
    const spec: Spec = {
      ...emptySpec(),
      types: {
        Filter: {
          kind: 'object',
          fields: [
            { name: 'status', required: true, type: { kind: 'string' } },
          ],
        },
      },
    };
    expect(
      resolveParamFields({ kind: 'ref', ref: 'Filter' }, spec),
    ).toEqual([
      { name: 'status', required: true, type: { kind: 'string' } },
    ]);
  });

  test('throws when ref target is missing', () => {
    expect(() =>
      resolveParamFields({ kind: 'ref', ref: 'Nope' }, emptySpec()),
    ).toThrow(/not in spec\.types/);
  });

  test('throws when ref target is not an object', () => {
    const spec: Spec = {
      ...emptySpec(),
      types: { S: { kind: 'string' } },
    };
    expect(() =>
      resolveParamFields({ kind: 'ref', ref: 'S' }, spec),
    ).toThrow(/expected object/);
  });
});
