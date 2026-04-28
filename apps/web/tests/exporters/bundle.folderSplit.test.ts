import { test, expect } from 'vitest';
import JSZip from 'jszip';
import { buildExportBundle } from '../../src/exporters/bundle';
import { emptySpec, type RefType } from '@zwaggen/core';

function multiFolderSpec() {
  const s = emptySpec('Multi');
  s.types['User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  s.types['auth/Token'] = { kind: 'object', fields: [{ name: 'value', required: true, type: { kind: 'string' } }] };
  s.endpoints = [
    {
      id: 'getRoot', method: 'GET', path: '/', pathParams: [], requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
      auth: 'inherit', useProxy: 'inherit',
    },
    {
      id: 'login', method: 'POST', path: '/login', pathParams: [], requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/Token' } as RefType }],
      auth: 'inherit', useProxy: 'inherit', folder: 'auth',
    },
    {
      id: 'oauthCallback', method: 'GET', path: '/auth/callback', pathParams: [], requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/Token' } as RefType }],
      auth: 'inherit', useProxy: 'inherit', folder: 'auth/oauth',
    },
  ];
  return s;
}

test('markdown is always folder-split — one file per endpoint', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), { markdown: true });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('markdown/getRoot.md')).not.toBeNull();
  expect(zip.file('markdown/auth/login.md')).not.toBeNull();
  expect(zip.file('markdown/auth/oauth/oauthCallback.md')).not.toBeNull();
  expect(zip.file('api.md')).toBeNull(); // old single-file is gone
});

test('openapi single-file (default)', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), { openapi: { format: 'json' } });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('openapi.json')).not.toBeNull();
  // No openapi/ directory entries when split is off.
  const splitPaths = Object.keys(zip.files).filter((p) => p.startsWith('openapi/'));
  expect(splitPaths).toEqual([]);
});

test('openapi split-by-folder writes one file per endpoint folder', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), { openapi: { format: 'json', splitByFolder: true } });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('openapi/_root.openapi.json')).not.toBeNull();
  expect(zip.file('openapi/auth.openapi.json')).not.toBeNull();
  expect(zip.file('openapi/auth/oauth.openapi.json')).not.toBeNull();
  expect(zip.file('openapi.json')).toBeNull();
});

test('jsonschema split-by-folder writes one file per endpoint folder', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), { jsonschema: { splitByFolder: true } });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('schemas/_root.schemas.json')).not.toBeNull();
  expect(zip.file('schemas/auth.schemas.json')).not.toBeNull();
  expect(zip.file('schemas/auth/oauth.schemas.json')).not.toBeNull();
});

test('jsonschema single-file (default) preserves old behavior', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), { jsonschema: {} });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('schemas.json')).not.toBeNull();
});

test('mix: markdown always-split + openapi split + jsonschema single', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), {
    markdown: true,
    openapi: { format: 'json', splitByFolder: true },
    jsonschema: {},
  });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('spec.zwag')).not.toBeNull();
  expect(zip.file('markdown/getRoot.md')).not.toBeNull();
  expect(zip.file('openapi/auth.openapi.json')).not.toBeNull();
  expect(zip.file('schemas.json')).not.toBeNull();
});
