import JSZip from 'jszip';
import YAML from 'yaml';
import { resolveSlice, toJSON, type Spec } from '@zwaggen/core';
import { toOpenApi } from './openapi';
import { toJsonSchemaBundle } from './jsonschema';
import { endpointToMarkdown, endpointMarkdownFilename } from './markdown';

export interface BundleOptions {
  openapi?: { format: 'json' | 'yaml'; splitByFolder?: boolean };
  jsonschema?: { splitByFolder?: boolean };
  markdown?: boolean;
}

export async function buildExportBundle(spec: Spec, opts: BundleOptions): Promise<Blob> {
  const zip = new JSZip();
  zip.file('spec.zwag', toJSON(spec));

  // OpenAPI: single-file (default) OR folder-split
  if (opts.openapi) {
    if (opts.openapi.splitByFolder) {
      for (const folder of distinctEndpointFolders(spec)) {
        const oas = toOpenApi(spec, { only: { folderPrefix: folder ?? '' } });
        const filename = folderFilename('openapi', folder, opts.openapi.format);
        const body = opts.openapi.format === 'json'
          ? JSON.stringify(oas, null, 2)
          : YAML.stringify(oas);
        zip.file(filename, body);
      }
    } else {
      const oas = toOpenApi(spec);
      const filename = `openapi.${opts.openapi.format}`;
      const body = opts.openapi.format === 'json'
        ? JSON.stringify(oas, null, 2)
        : YAML.stringify(oas);
      zip.file(filename, body);
    }
  }

  // JSON Schema: single-file (default) OR folder-split (synthetic-spec approach)
  if (opts.jsonschema) {
    if (opts.jsonschema.splitByFolder) {
      for (const folder of distinctEndpointFolders(spec)) {
        const slice = resolveSlice(spec, { folderPrefix: folder ?? '' });
        // Build a synthetic spec containing only the slice's types so the
        // existing toJsonSchemaBundle (which iterates spec.types) emits a
        // folder-scoped bundle.
        const folderTypes: Record<string, typeof spec.types[string]> = {};
        for (let i = 0; i < slice.typeKeys.length; i++) {
          folderTypes[slice.typeKeys[i]!] = slice.types[i]!;
        }
        const folderSpec: Spec = { ...spec, types: folderTypes };
        const filename = folderFilename('schemas', folder, 'json');
        zip.file(filename, JSON.stringify(toJsonSchemaBundle(folderSpec), null, 2));
      }
    } else {
      zip.file('schemas.json', JSON.stringify(toJsonSchemaBundle(spec), null, 2));
    }
  }

  // Markdown — always folder-split (no single-file option). Filename is
  // METHOD_path.md (via endpointMarkdownFilename) so a glance at the zip
  // tree tells you what each file documents.
  if (opts.markdown) {
    for (const ep of spec.endpoints) {
      const filename = endpointMarkdownFilename(ep);
      const path = ep.folder ? `markdown/${ep.folder}/${filename}` : `markdown/${filename}`;
      zip.file(path, endpointToMarkdown(ep, spec));
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Returns the set of distinct endpoint folder paths (each appearing exactly
 * once), plus `undefined` if any endpoint has no folder. Sorted alphabetically.
 * Nested folders ARE included as their own entries: a spec with endpoints in
 * `auth` and `auth/oauth` returns `[undefined, 'auth', 'auth/oauth']`.
 *
 * Note: when used as a `folderPrefix` filter, `'auth'` MATCHES descendants
 * (`auth/oauth/*`), so the parent folder's slice is a SUPERSET of the child's.
 * This is intentional — the parent folder represents the "subsystem", and a
 * recipient asking for the auth subsystem should get everything inside.
 */
function distinctEndpointFolders(spec: Spec): Array<string | undefined> {
  const set = new Set<string | undefined>();
  for (const ep of spec.endpoints) set.add(ep.folder);
  return Array.from(set).sort((a, b) => (a ?? '').localeCompare(b ?? ''));
}

function folderFilename(prefix: 'openapi' | 'schemas', folder: string | undefined, ext: string): string {
  const base = folder ?? '_root';
  return `${prefix}/${base}.${prefix}.${ext}`;
}
