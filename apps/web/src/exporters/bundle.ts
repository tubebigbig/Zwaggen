import JSZip from 'jszip';
import YAML from 'yaml';
import { toJSON, type Spec } from '@zwaggen/core';
import { toOpenApi } from './openapi';
import { toJsonSchemaBundle } from './jsonschema';
import { toMarkdown } from './markdown';

export interface BundleOptions {
  openapi?: 'json' | 'yaml';
  jsonschema?: boolean;
  markdown?: boolean;
}

export async function buildExportBundle(spec: Spec, opts: BundleOptions): Promise<Blob> {
  const zip = new JSZip();
  zip.file('spec.zwag', toJSON(spec));
  if (opts.openapi) {
    const oas = toOpenApi(spec);
    if (opts.openapi === 'json') zip.file('openapi.json', JSON.stringify(oas, null, 2));
    else zip.file('openapi.yaml', YAML.stringify(oas));
  }
  if (opts.jsonschema) zip.file('schemas.json', JSON.stringify(toJsonSchemaBundle(spec), null, 2));
  if (opts.markdown) zip.file('api.md', toMarkdown(spec));
  return zip.generateAsync({ type: 'blob' });
}
