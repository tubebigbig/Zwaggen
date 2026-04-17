import { expect, test } from 'vitest';
import JSZip from 'jszip';
import { buildExportBundle } from '../../src/exporters/bundle';
import { emptySpec } from '../../src/schema/defaults';

test('always includes canonical JSON', async () => {
  const blob = await buildExportBundle(emptySpec('My'), { openapi: 'json' });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('spec.gen-spec.json')).not.toBeNull();
  expect(zip.file('openapi.json')).not.toBeNull();
});

test('supports all formats', async () => {
  const blob = await buildExportBundle(emptySpec('My'), { openapi: 'yaml', jsonschema: true, markdown: true });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('spec.gen-spec.json')).not.toBeNull();
  expect(zip.file('openapi.yaml')).not.toBeNull();
  expect(zip.file('schemas.json')).not.toBeNull();
  expect(zip.file('api.md')).not.toBeNull();
});
