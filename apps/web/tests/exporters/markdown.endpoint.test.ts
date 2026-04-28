import { it, expect } from 'vitest';
import { endpointToMarkdown, endpointMarkdownFilename } from '../../src/exporters/markdown';
import { emptySpec, type Spec, type Endpoint, type RefType } from '@zwaggen/core';

function makeSpec(): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'name', required: true, type: { kind: 'string' }, description: 'Display name' },
    ],
  };
  return s;
}

const baseEp: Omit<Endpoint, 'id' | 'method' | 'path'> = {
  pathParams: [],
  requestBody: null,
  responses: [],
  auth: 'inherit',
  useProxy: 'inherit',
};

it('renders all sections for a typical endpoint', () => {
  const spec = makeSpec();
  // Add an example to User so the **Example**: block renders. Constructed
  // fresh because TS doesn't widen the spec.types[string] union back to
  // ObjectType when spreading.
  spec.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'name', required: true, type: { kind: 'string' }, description: 'Display name' },
    ],
    example: { id: 'u_42', name: 'Alice' },
  };
  const ep: Endpoint = {
    ...baseEp,
    id: 'getUser',
    method: 'GET',
    path: '/users/{id}',
    description: 'Fetch a user by id\n\nLong description here.',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' }, description: 'User id' }],
    responses: [
      { status: 200, type: { kind: 'ref', ref: 'User' } as RefType },
      { status: 404, type: { kind: 'object', fields: [{ name: 'error', required: true, type: { kind: 'string' } }] } },
    ],
  };

  const md = endpointToMarkdown(ep, spec);

  expect(md).toContain('# Fetch a user by id');
  expect(md).toContain('Long description here.');
  expect(md).toContain('## Info');
  expect(md).toContain('* URL: `https://api.example.com/users/{id}`');
  expect(md).toContain('* Method: `GET`');
  expect(md).toContain('## Parameters');
  expect(md).toContain('### Path params');
  expect(md).toContain('| id | string | yes | User id |');
  expect(md).toContain('## Success Response');
  expect(md).toContain('**Code**: 200');
  expect(md).toContain('| name | string | Display name |');
  expect(md).toContain('## Error Response');
  expect(md).toContain('- 404');
  expect(md).toContain('**Format**: json');
  // Example renders because User has a one-level ref-target example.
  expect(md).toContain('**Example**:');
  expect(md).toContain('"u_42"');
});

it('omits Parameters section when there are no params', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'getStatus', method: 'GET', path: '/status',
    responses: [{ status: 200, type: { kind: 'object', fields: [{ name: 'ok', required: true, type: { kind: 'boolean' } }] } }],
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).not.toContain('## Parameters');
  expect(md).toContain('## Success Response');
});

it('renders _None defined_ when there is no 2xx response', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'broken', method: 'POST', path: '/broken',
    responses: [{ status: 500, type: { kind: 'object', fields: [] } }],
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toContain('## Success Response\n\n_None defined_');
  expect(md).toContain('## Error Response');
  expect(md).toContain('- 500');
});

it('falls back to METHOD path when description is empty', () => {
  const spec = makeSpec();
  const ep: Endpoint = { ...baseEp, id: 'foo', method: 'DELETE', path: '/foo/{id}' };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toMatch(/^# DELETE \/foo\/\{id\}/);
});

it('renders Body section as a table when requestBody is an object', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'createUser', method: 'POST', path: '/users',
    requestBody: { kind: 'object', fields: [{ name: 'name', required: true, type: { kind: 'string' } }] },
    responses: [{ status: 201, type: { kind: 'ref', ref: 'User' } as RefType }],
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toContain('### Body');
  expect(md).toContain('| name | string |  |');
});

it('inlines the transitive type closure under a ## Types section', () => {
  const spec = makeSpec();
  // Add a 2nd type that User does NOT reference, plus one User DOES reference.
  spec.types['Address'] = {
    kind: 'object',
    fields: [{ name: 'street', required: true, type: { kind: 'string' } }],
  };
  spec.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'address', required: false, type: { kind: 'ref', ref: 'Address' } as RefType },
    ],
  };
  spec.types['Unrelated'] = { kind: 'object', fields: [] };
  const ep: Endpoint = {
    pathParams: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
    auth: 'inherit',
    useProxy: 'inherit',
    id: 'getUser',
    method: 'GET',
    path: '/users/{id}',
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toContain('## Types');
  expect(md).toContain('### User');
  expect(md).toContain('### Address');
  // Unrelated type must NOT be inlined (closure walker drops it).
  expect(md).not.toContain('### Unrelated');
});

it('omits ## Types when the endpoint has no type refs', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    pathParams: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'object', fields: [{ name: 'ok', required: true, type: { kind: 'boolean' } }] } }],
    auth: 'inherit',
    useProxy: 'inherit',
    id: 'getStatus',
    method: 'GET',
    path: '/status',
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).not.toContain('## Types');
});

it('endpointMarkdownFilename uses METHOD + path-sanitized', () => {
  const ep = (method: Endpoint['method'], path: string): Endpoint => ({
    pathParams: [], requestBody: null, responses: [],
    auth: 'inherit', useProxy: 'inherit',
    id: 'x', method, path,
  });
  expect(endpointMarkdownFilename(ep('GET', '/users/{id}'))).toBe('GET_users_id.md');
  expect(endpointMarkdownFilename(ep('POST', '/users'))).toBe('POST_users.md');
  expect(endpointMarkdownFilename(ep('GET', '/auth/oauth/callback'))).toBe('GET_auth_oauth_callback.md');
  expect(endpointMarkdownFilename(ep('GET', '/'))).toBe('GET_index.md');
  expect(endpointMarkdownFilename(ep('DELETE', '/orders/{id}/items/{itemId}'))).toBe('DELETE_orders_id_items_itemId.md');
});

it('field descriptions cascade through ref chains until one is found or overridden', () => {
  // Spec author put the description on the type (TypeB), not on every field
  // that uses it. Without a cascade, the field column stays empty.
  const spec = makeSpec();
  spec.types['TypeB'] = {
    kind: 'object',
    description: 'A B-thing — described once at the type level.',
    fields: [{ name: 'x', required: true, type: { kind: 'string' } }],
  };
  spec.types['TypeC'] = {
    kind: 'object',
    fields: [
      // Field with no description; falls back to TypeB's description.
      { name: 'inheritsDesc', required: true, type: { kind: 'ref', ref: 'TypeB' } as RefType },
      // Field that overrides — its own description wins, ref chain is ignored.
      { name: 'overridden', required: true, type: { kind: 'ref', ref: 'TypeB' } as RefType, description: 'Overridden at the field level.' },
    ],
  };
  const ep: Endpoint = {
    pathParams: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'TypeC' } as RefType }],
    auth: 'inherit', useProxy: 'inherit',
    id: 'getC', method: 'GET', path: '/c',
  };
  const md = endpointToMarkdown(ep, spec);
  // Inherited description from TypeB
  expect(md).toContain('| inheritsDesc | [TypeB](#typeb) | A B-thing — described once at the type level. |');
  // Field-level override wins
  expect(md).toContain('| overridden | [TypeB](#typeb) | Overridden at the field level. |');
});

it('union variants in field tables use escaped pipes (\\|) so the table column structure survives', () => {
  // Real-world case: a search-result field whose type is `Array<Union<RefA, RefB, ...>>`.
  // Without escaping, each `|` between variants reads as a column separator
  // and the row splodges across N extra columns.
  const spec = makeSpec();
  spec.types['MetaA'] = { kind: 'object', fields: [] };
  spec.types['MetaB'] = { kind: 'object', fields: [] };
  spec.endpoints = [];
  const ep: Endpoint = {
    pathParams: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'object', fields: [
      { name: 'meta', required: true, type: { kind: 'array', element: { kind: 'union', variants: [
        { kind: 'ref', ref: 'MetaA' } as RefType,
        { kind: 'ref', ref: 'MetaB' } as RefType,
      ] } } },
    ] } }],
    auth: 'inherit', useProxy: 'inherit',
    id: 'getResults', method: 'GET', path: '/search',
  };
  const md = endpointToMarkdown(ep, spec);
  // Pipes inside the union are escaped — the row has exactly the expected
  // 3 cells (field / type / description), no extra columns.
  expect(md).toContain('| meta | ([MetaA](#metaa) \\| [MetaB](#metab))[] |  |');
  expect(md).not.toMatch(/\| meta \| \[MetaA\]\(#metaa\) \| /);  // unescaped pipe would split here
});

it('Example block renders only when the response type or its direct ref has an example', () => {
  const spec = makeSpec();
  // No example on User — so the popover must NOT render an Example block.
  const ep: Endpoint = {
    ...baseEp,
    id: 'getUser', method: 'GET', path: '/users/{id}',
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
  };
  expect(endpointToMarkdown(ep, spec)).not.toContain('**Example**');

  // Add the example on the type — now it renders. Construct fresh (TS spread).
  spec.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'name', required: true, type: { kind: 'string' }, description: 'Display name' },
    ],
    example: { id: 'u_1', name: 'Bob' },
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toContain('**Example**:');
  expect(md).toContain('"u_1"');
});

it('Example block does NOT walk a multi-step ref chain (only one direct level)', () => {
  // TypeA → TypeB → TypeC (TypeC has the example). Only one hop is followed.
  const spec = makeSpec();
  spec.types['TypeC'] = { kind: 'object', fields: [], example: { from: 'C' } };
  spec.types['TypeB'] = { kind: 'object', fields: [{ name: 'x', required: true, type: { kind: 'ref', ref: 'TypeC' } as RefType }] };
  spec.types['TypeA'] = { kind: 'object', fields: [{ name: 'y', required: true, type: { kind: 'ref', ref: 'TypeB' } as RefType }] };
  const ep: Endpoint = {
    ...baseEp,
    id: 'getA', method: 'GET', path: '/a',
    responses: [{ status: 200, type: { kind: 'ref', ref: 'TypeA' } as RefType }],
  };
  // TypeA has no own example, and one level deep TypeB has none either.
  // Don't follow further into TypeC.
  expect(endpointToMarkdown(ep, spec)).not.toContain('"from"');
  expect(endpointToMarkdown(ep, spec)).not.toContain('**Example**');
});

it('Inline (non-ref) response type renders its own example field', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'inline', method: 'GET', path: '/inline',
    responses: [{ status: 200, type: { kind: 'object', fields: [{ name: 'ok', required: true, type: { kind: 'boolean' } }], example: { ok: true } } }],
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toContain('**Example**:');
  expect(md).toContain('"ok": true');
});
