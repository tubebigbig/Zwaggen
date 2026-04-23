import { describe, expect, it } from 'vitest';
import { expandParam } from '../../src/runner/expandParam';
import { emptySpec } from '../../src/schema/defaults';
import type { ParamDef, Spec } from '../../src/schema/types';

describe('expandParam', () => {
  it('non-object param passes through unchanged', () => {
    const param: ParamDef = { name: 'q', required: true, type: { kind: 'string' } };
    expect(expandParam(param, emptySpec())).toEqual([param]);
  });

  it('inline-object param expands to fields', () => {
    const param: ParamDef = {
      name: 'filter',
      required: true,
      type: {
        kind: 'object',
        fields: [
          { name: 'status', required: true, type: { kind: 'string' } },
          { name: 'category', required: false, type: { kind: 'string' } },
        ],
      },
    };
    const out = expandParam(param, emptySpec());
    expect(out).toEqual([
      { name: 'status', required: true, type: { kind: 'string' }, description: undefined },
      { name: 'category', required: false, type: { kind: 'string' }, description: undefined },
    ]);
  });

  it('ref-to-object param resolves and expands', () => {
    const spec: Spec = {
      ...emptySpec(),
      types: {
        Filter: {
          kind: 'object',
          fields: [{ name: 'status', required: true, type: { kind: 'string' } }],
        },
      },
    };
    const out = expandParam(
      { name: 'q', required: true, type: { kind: 'ref', ref: 'Filter' } },
      spec,
    );
    expect(out).toEqual([
      { name: 'status', required: true, type: { kind: 'string' }, description: undefined },
    ]);
  });

  it('expanded field is required only if BOTH the param AND the field are required', () => {
    const spec: Spec = {
      ...emptySpec(),
      types: {
        Filter: {
          kind: 'object',
          fields: [{ name: 'status', required: true, type: { kind: 'string' } }],
        },
      },
    };
    const out = expandParam(
      { name: 'q', required: false, type: { kind: 'ref', ref: 'Filter' } },
      spec,
    );
    expect(out[0]!.required).toBe(false);
  });

  it('ref to a non-object passes through unchanged', () => {
    const spec: Spec = {
      ...emptySpec(),
      types: { Status: { kind: 'string', enum: ['active'] } },
    };
    const param: ParamDef = { name: 'q', required: true, type: { kind: 'ref', ref: 'Status' } };
    expect(expandParam(param, spec)).toEqual([param]);
  });
});
