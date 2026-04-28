import { it, expect } from 'vitest';
import { endpointToMarkdown } from '../../src/exporters/markdown';
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
