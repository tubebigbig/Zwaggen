import { describe, it, expect } from 'vitest';
import {
  emptySpec,
  generateTs,
  generateZod,
  generateClient,
  toOpenApi,
  type Spec,
  type RefType,
} from '../../src';

function fixture(): Spec {
  const s = emptySpec();
  s.types['User'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  s.types['Company'] = {
    kind: 'object',
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  s.endpoints = [
    {
      id: 'getUser',
      method: 'GET',
      path: '/users/{id}',
      pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
      auth: 'inherit',
      useProxy: 'inherit',
    },
    {
      id: 'getCompany',
      method: 'GET',
      path: '/companies',
      pathParams: [],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'Company' } as RefType }],
      auth: 'inherit',
      useProxy: 'inherit',
    },
  ];
  return s;
}

describe('codegen with { only }', () => {
  it('generateTs filters to slice', () => {
    const out = generateTs(fixture(), { only: { endpointIds: ['getUser'] } });
    expect(out).toContain('User');
    expect(out).not.toContain('Company');
  });

  it('generateZod filters to slice', () => {
    const out = generateZod(fixture(), { only: { endpointIds: ['getUser'] } });
    expect(out).toContain('UserSchema');
    expect(out).not.toContain('CompanySchema');
  });

  it('generateClient filters to slice', () => {
    const out = generateClient(fixture(), { only: { endpointIds: ['getUser'] } });
    expect(out).toContain('getUser');
    expect(out).not.toContain('getCompany');
    expect(out).toContain('User');
    expect(out).not.toContain('Company');
  });

  it('toOpenApi filters to slice', () => {
    const out = toOpenApi(fixture(), { only: { endpointIds: ['getUser'] } }) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(Object.keys(out.paths)).toEqual(['/users/{id}']);
    expect(Object.keys(out.components.schemas)).toEqual(['User']);
  });

  it('default (no opts) emits the full spec — full-output sanity', () => {
    const out = generateTs(fixture());
    expect(out).toContain('User');
    expect(out).toContain('Company');
  });
});
