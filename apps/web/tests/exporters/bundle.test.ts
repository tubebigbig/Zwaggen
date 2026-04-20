import { expect, test } from 'vitest';
import JSZip from 'jszip';
import { buildExportBundle } from '../../src/exporters/bundle';
import { emptySpec } from '@zwaggen/core';
import { fromOpenApi } from '../../src/importers/openapi';
import { toOpenApi } from '../../src/exporters/openapi';

test('always includes canonical JSON', async () => {
  const blob = await buildExportBundle(emptySpec('My'), { openapi: 'json' });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('spec.zwaggen.json')).not.toBeNull();
  expect(zip.file('openapi.json')).not.toBeNull();
});

test('supports all formats', async () => {
  const blob = await buildExportBundle(emptySpec('My'), { openapi: 'yaml', jsonschema: true, markdown: true });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('spec.zwaggen.json')).not.toBeNull();
  expect(zip.file('openapi.yaml')).not.toBeNull();
  expect(zip.file('schemas.json')).not.toBeNull();
  expect(zip.file('api.md')).not.toBeNull();
});

test('types + endpoints with folders round-trip through OpenAPI', () => {
  const original = emptySpec('Round');
  original.types['auth/User'] = { kind: 'object', fields: [
    { name: 'id', required: true, type: { kind: 'string' } },
  ]};
  original.types['auth/admin/Session'] = { kind: 'object', fields: [
    { name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } },
  ]};
  original.types['Order'] = { kind: 'object', fields: [] };
  original.endpoints.push({
    id: 'a', method: 'GET', path: '/me', folder: 'auth',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });

  const doc = toOpenApi(original);
  const { spec: reimported, warnings } = fromOpenApi(doc);
  expect(warnings).toEqual([]);

  expect(reimported.types['auth/User']).toBeDefined();
  expect(reimported.types['auth/admin/Session']).toBeDefined();
  expect(reimported.types['Order']).toBeDefined();

  // structural equality on types (order of keys is irrelevant for deep-equal)
  expect(reimported.types['auth/admin/Session']).toEqual(original.types['auth/admin/Session']);

  const ep = reimported.endpoints[0]!;
  expect(ep.folder).toBe('auth');
  expect(ep.responses[0]!.type).toEqual({ kind: 'ref', ref: 'auth/User' });
});

test('extends round-trips through OpenAPI', () => {
  const original = emptySpec('RoundExt');
  original.types['Base'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  original.types['User'] = {
    kind: 'object',
    extends: ['Base'],
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  const doc = toOpenApi(original);
  const { spec: reimported, warnings } = fromOpenApi(doc);
  expect(warnings).toEqual([]);
  const user = reimported.types['User']! as { kind: 'object'; extends?: string[]; fields: Array<{ name: string }> };
  expect(user.extends).toEqual(['Base']);
  expect(user.fields.map((f) => f.name)).toEqual(['name']);
});
