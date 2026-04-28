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
  expect(md).toContain('```json');
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

it('JSON example blocks emit refs as <ref:Name> not as markdown links', () => {
  // Markdown links inside fenced code blocks don't render — the user reported
  // that `[Name](#Name)` inside the ```json fence stayed as literal text and
  // wasn't navigable. The skeleton now emits `<ref:Name>` so it's at least
  // visually distinct and Cmd-F-able to the inlined `### Name` heading.
  const spec = makeSpec();
  spec.types['Item'] = { kind: 'object', fields: [{ name: 'sku', required: true, type: { kind: 'string' } }] };
  spec.types['Order'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'items', required: true, type: { kind: 'array', element: { kind: 'ref', ref: 'Item' } as RefType } },
    ],
  };
  const ep: Endpoint = {
    pathParams: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'object', fields: [
      { name: 'order', required: true, type: { kind: 'ref', ref: 'Order' } as RefType },
      { name: 'item', required: false, type: { kind: 'ref', ref: 'Item' } as RefType },
    ] } }],
    auth: 'inherit', useProxy: 'inherit',
    id: 'getOrder', method: 'GET', path: '/orders/{id}',
  };
  const md = endpointToMarkdown(ep, spec);
  const codeBlockSlice = md.slice(md.indexOf('**Example**'), md.indexOf('## Types'));
  // Both refs render as <ref:Name> placeholders inside the JSON example.
  // No markdown link syntax leaks into the code block.
  expect(codeBlockSlice).toContain('<ref:Order>');
  expect(codeBlockSlice).toContain('<ref:Item>');
  expect(codeBlockSlice).not.toContain('](#');
});
