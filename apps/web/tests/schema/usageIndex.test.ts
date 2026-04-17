import { describe, it, expect } from 'vitest';
import { buildUsageIndex } from '../../src/schema/rename';
import type { Spec, TypeDef } from '../../src/schema/types';
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/types';

const ref = (name: string): TypeDef => ({ kind: 'ref', ref: name });
const obj = (fields: { name: string; type: TypeDef; required?: boolean }[]): TypeDef => ({
  kind: 'object',
  fields: fields.map((f) => ({ name: f.name, type: f.type, required: f.required ?? true })),
});

function makeSpec(partial: Partial<Spec>): Spec {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    info: { name: 'test' },
    types: {},
    environments: { default: { variables: [] } },
    activeEnvironment: 'default',
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [],
    ...partial,
  };
}

describe('buildUsageIndex', () => {
  it('1. endpoint — requestBody ref produces correct entry', () => {
    const spec = makeSpec({
      endpoints: [
        {
          id: 'ep1',
          method: 'POST',
          path: '/users',
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: ref('User'),
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    });
    const index = buildUsageIndex(spec);
    expect(index['User']).toEqual([
      { kind: 'endpoint', endpointId: 'ep1', label: 'POST /users · requestBody' },
    ]);
  });

  it('2a. endpoint — pathParams[i] label includes bracketed index', () => {
    const spec = makeSpec({
      endpoints: [
        {
          id: 'ep1',
          method: 'GET',
          path: '/users/{id}',
          pathParams: [
            { name: 'id', required: true, type: ref('UserId') },
          ],
          queryParams: [],
          headers: [],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    });
    const index = buildUsageIndex(spec);
    expect(index['UserId']).toEqual([
      { kind: 'endpoint', endpointId: 'ep1', label: 'GET /users/{id} · pathParams[0]' },
    ]);
  });

  it('2b. endpoint — queryParams[i] label includes bracketed index', () => {
    const spec = makeSpec({
      endpoints: [
        {
          id: 'ep1',
          method: 'GET',
          path: '/search',
          pathParams: [],
          queryParams: [
            { name: 'filter', required: false, type: ref('FilterType') },
            { name: 'sort', required: false, type: ref('SortOrder') },
          ],
          headers: [],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    });
    const index = buildUsageIndex(spec);
    expect(index['FilterType']).toEqual([
      { kind: 'endpoint', endpointId: 'ep1', label: 'GET /search · queryParams[0]' },
    ]);
    expect(index['SortOrder']).toEqual([
      { kind: 'endpoint', endpointId: 'ep1', label: 'GET /search · queryParams[1]' },
    ]);
  });

  it('2c. endpoint — headers[i] label includes bracketed index', () => {
    const spec = makeSpec({
      endpoints: [
        {
          id: 'ep1',
          method: 'GET',
          path: '/data',
          pathParams: [],
          queryParams: [],
          headers: [
            { name: 'X-Token', required: true, type: ref('TokenType') },
          ],
          requestBody: null,
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    });
    const index = buildUsageIndex(spec);
    expect(index['TokenType']).toEqual([
      { kind: 'endpoint', endpointId: 'ep1', label: 'GET /data · headers[0]' },
    ]);
  });

  it('2d. endpoint — responses[i] label includes bracketed index', () => {
    const spec = makeSpec({
      endpoints: [
        {
          id: 'ep1',
          method: 'GET',
          path: '/items',
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: null,
          responses: [
            { status: 200, type: ref('ItemList') },
            { status: 404, type: ref('ErrorBody') },
          ],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    });
    const index = buildUsageIndex(spec);
    expect(index['ItemList']).toEqual([
      { kind: 'endpoint', endpointId: 'ep1', label: 'GET /items · responses[0]' },
    ]);
    expect(index['ErrorBody']).toEqual([
      { kind: 'endpoint', endpointId: 'ep1', label: 'GET /items · responses[1]' },
    ]);
  });

  it('3. type → type ref produces correct entry', () => {
    const spec = makeSpec({
      types: {
        User: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] },
        Account: obj([{ name: 'user', type: ref('User') }]),
      },
    });
    const index = buildUsageIndex(spec);
    expect(index['User']).toEqual([
      { kind: 'type', typeName: 'Account', label: 'Account' },
    ]);
  });

  it('4a. nested container — ref inside array element produces one entry', () => {
    const spec = makeSpec({
      types: {
        UserList: { kind: 'array', element: ref('User') },
        User: { kind: 'object', fields: [] },
      },
    });
    const index = buildUsageIndex(spec);
    expect(index['User']).toEqual([
      { kind: 'type', typeName: 'UserList', label: 'UserList' },
    ]);
  });

  it('4b. nested container — ref inside union variant produces one entry', () => {
    const spec = makeSpec({
      types: {
        Response: { kind: 'union', variants: [ref('SuccessBody'), { kind: 'null' }] },
        SuccessBody: { kind: 'object', fields: [] },
      },
    });
    const index = buildUsageIndex(spec);
    expect(index['SuccessBody']).toEqual([
      { kind: 'type', typeName: 'Response', label: 'Response' },
    ]);
  });

  it('4c. nested container — ref inside nested object field produces one entry', () => {
    const spec = makeSpec({
      types: {
        Outer: obj([
          {
            name: 'inner',
            type: obj([{ name: 'leaf', type: ref('LeafType') }]),
          },
        ]),
        LeafType: { kind: 'string' },
      },
    });
    const index = buildUsageIndex(spec);
    expect(index['LeafType']).toEqual([
      { kind: 'type', typeName: 'Outer', label: 'Outer' },
    ]);
  });

  it('5. self-ref is dropped — Tree with recursive array element has no entry for Tree', () => {
    const spec = makeSpec({
      types: {
        Tree: obj([
          { name: 'children', type: { kind: 'array', element: ref('Tree') } },
        ]),
      },
    });
    const index = buildUsageIndex(spec);
    expect(index['Tree']).toBeUndefined();
  });

  it('6. unused type has no index entry (undefined, not empty array)', () => {
    const spec = makeSpec({
      types: {
        Ghost: { kind: 'object', fields: [] },
      },
    });
    const index = buildUsageIndex(spec);
    expect(index['Ghost']).toBeUndefined();
    // Confirm the ?? [] pattern works as the UI would use it
    expect(index['Ghost'] ?? []).toEqual([]);
  });

  it('7. multiple references — deterministic order: types first, then endpoints in spec order', () => {
    const spec = makeSpec({
      types: {
        Wrapper: obj([{ name: 'user', type: ref('User') }]),
        User: { kind: 'object', fields: [] },
      },
      endpoints: [
        {
          id: 'ep1',
          method: 'POST',
          path: '/a',
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: ref('User'),
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
        {
          id: 'ep2',
          method: 'GET',
          path: '/b',
          pathParams: [],
          queryParams: [],
          headers: [],
          requestBody: ref('User'),
          responses: [],
          auth: 'inherit',
          useProxy: 'inherit',
        },
      ],
    });
    const index = buildUsageIndex(spec);
    expect(index['User']).toEqual([
      { kind: 'type', typeName: 'Wrapper', label: 'Wrapper' },
      { kind: 'endpoint', endpointId: 'ep1', label: 'POST /a · requestBody' },
      { kind: 'endpoint', endpointId: 'ep2', label: 'GET /b · requestBody' },
    ]);
  });
});
