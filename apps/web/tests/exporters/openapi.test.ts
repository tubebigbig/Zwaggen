import { expect, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec } from '../../src/schema/defaults';

it('emits servers[] when info.baseUrl is set', () => {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  const out = toOpenApi(s);
  expect(out.servers).toEqual([{ url: 'https://api.example.com' }]);
});

it('omits servers when info.baseUrl is absent', () => {
  const out = toOpenApi(emptySpec());
  expect('servers' in out).toBe(false);
});

test('emits basic OpenAPI doc', () => {
  const s = emptySpec('MyAPI');
  s.types.User = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  s.endpoints.push({
    id: 'e1', method: 'GET', path: '/users/{id}',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
    queryParams: [], headers: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const oas = toOpenApi(s);
  expect(oas.openapi).toBe('3.1.0');
  expect(oas.components.schemas.User).toBeDefined();
  expect(oas.paths['/users/{id}'].get.responses['200'].content['application/json'].schema.$ref)
    .toBe('#/components/schemas/User');
});
