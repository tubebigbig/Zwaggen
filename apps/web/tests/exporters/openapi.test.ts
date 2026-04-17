import { expect, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec } from '../../src/schema/defaults';

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
