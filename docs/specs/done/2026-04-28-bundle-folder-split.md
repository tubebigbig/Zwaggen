# Spec — Bundle export: folder-split for Markdown / OpenAPI / JSON Schema

## Problem

The top-bar Export menu's bundle (`apps/web/src/exporters/bundle.ts`) emits one file each for Markdown / OpenAPI / JSON Schema:

- `api.md` — full-spec markdown reference (developer-tree style)
- `openapi.json` (or `openapi.yaml`) — single full-spec OpenAPI doc
- `schemas.json` — single full-spec JSON Schema bundle

For real teams: a 200-endpoint spec produces a 5,000-line `api.md` that nobody reads end-to-end. And a single `openapi.json` is hard to "give the auth team only their slice." Splitting by folder solves both.

## Success criteria

### Markdown (always folder-split)

- The bundle's `api.md` (single-file) is REPLACED with a `markdown/` directory in the zip:
  - One `.md` file per endpoint
  - Endpoints in folders mirror the folder hierarchy: `markdown/{folder}/{endpoint-id}.md` (nested folders OK: `markdown/auth/oauth/{endpoint-id}.md`)
  - Endpoints with no folder go to `markdown/{endpoint-id}.md` (no `_root` prefix; root-level files just live at the top of the `markdown/` directory)
- Each file's content = `endpointToMarkdown(ep, spec)` (the helper from the just-shipped per-endpoint-markdown slice).
- The `markdown` checkbox in `ExportMenu` stays a single toggle — no sub-options. Off = no `markdown/` directory; on = always folder-split.
- The full-spec `toMarkdown()` function in `apps/web/src/exporters/markdown.ts` STAYS in the codebase (not removed yet — could have other consumers we haven't audited; safer to leave) but is no longer called by the bundle exporter.

### OpenAPI (new "split by folder" sub-option)

- ExportMenu's OpenAPI selector gains a sibling checkbox **"Split by folder"** (only visible when OpenAPI is on, i.e. format !== 'off').
- When unchecked (default): single `openapi.json` / `openapi.yaml` like today.
- When checked: bundle contains an `openapi/` directory:
  - One file per endpoint folder: `openapi/{folder}.openapi.{json|yaml}` (e.g. `openapi/auth.openapi.json`, `openapi/auth/oauth.openapi.json`)
  - Each file contains only endpoints under that folder PLUS their transitive type closure (uses existing `toOpenApi(spec, { only: { folderPrefix } })` from Slice 1)
  - Root-level endpoints (no folder) go to `openapi/_root.openapi.{json|yaml}` (underscore prefix to avoid colliding with a folder literally named "root")

### JSON Schema (new "split by folder" sub-option)

- ExportMenu's JSON Schema checkbox gains a sibling **"Split by folder"** sub-checkbox (only visible when JSON Schema is on).
- When unchecked (default): single `schemas.json` like today.
- When checked: bundle contains a `schemas/` directory:
  - One file per endpoint folder: `schemas/{folder}.schemas.json`
  - Each file contains only types referenced by endpoints under that folder (transitive closure — same `resolveSlice` engine)
  - Root-level: `schemas/_root.schemas.json`

### Bundle options shape

```ts
export interface BundleOptions {
  openapi?: { format: 'json' | 'yaml'; splitByFolder?: boolean };  // omit to skip openapi
  jsonschema?: { splitByFolder?: boolean };                        // omit to skip jsonschema
  markdown?: boolean;                                              // true = always folder-split
}
```

(Migrating from the current flat `openapi: 'json' | 'yaml'`, `jsonschema: boolean`, `markdown: boolean`. ExportMenu is the only call site.)

### Tests

- `apps/web/tests/exporters/bundle.folderSplit.test.ts` — new file:
  - Markdown always splits per endpoint; folder structure matches the spec
  - OpenAPI single-file vs split mode
  - JSON Schema single-file vs split mode
  - Mix: one endpoint at root + one in `auth/` + one in `auth/oauth/` produces correct paths
- Update `bundle.test.ts` for the new `BundleOptions` shape (existing tests stay covering single-file modes via the new `splitByFolder: false`).

### i18n

- `splitByFolder` (en: "Split by folder", zh-TW: "依資料夾分割")

## Out of scope

- **Per-folder README.md / index files** for the markdown directory. (Folder structure is its own index; README files would add complexity.) Easy follow-up if asked.
- **JSON Schema split by TYPE folder** (vs endpoint folder). The endpoint-folder model is more aligned with "share a subsystem"; type folders are an internal organization detail. Defer.
- **Removing the full-spec `toMarkdown` function** from the codebase. Leave it for now in case there are non-bundle consumers; audit + delete in a follow-up.
- **Custom file naming patterns** (e.g. `{folder}/{name}-openapi.json` vs `{folder}.openapi.json`). v1 uses a fixed scheme; configurable can come later.
- **Live preview panel changes** — the per-folder splits are bundle-only. The live-preview panel still shows full-spec output.

## Approach

### `bundle.ts` — new options shape + folder iteration

```ts
import { resolveSlice } from '@zwaggen/core';
import { endpointToMarkdown } from './markdown';

export interface BundleOptions {
  openapi?: { format: 'json' | 'yaml'; splitByFolder?: boolean };
  jsonschema?: { splitByFolder?: boolean };
  markdown?: boolean;
}

export async function buildExportBundle(spec: Spec, opts: BundleOptions): Promise<Blob> {
  const zip = new JSZip();
  zip.file('spec.zwag', toJSON(spec));

  // OpenAPI
  if (opts.openapi) {
    if (opts.openapi.splitByFolder) {
      for (const folder of distinctEndpointFolders(spec)) {
        const filename = folderFilename('openapi', folder, opts.openapi.format);
        const oas = toOpenApi(spec, { only: { folderPrefix: folder ?? '' } });
        zip.file(filename, opts.openapi.format === 'json' ? JSON.stringify(oas, null, 2) : YAML.stringify(oas));
      }
    } else {
      const oas = toOpenApi(spec);
      zip.file(`openapi.${opts.openapi.format}`, opts.openapi.format === 'json' ? JSON.stringify(oas, null, 2) : YAML.stringify(oas));
    }
  }

  // JSON Schema
  if (opts.jsonschema) {
    if (opts.jsonschema.splitByFolder) {
      for (const folder of distinctEndpointFolders(spec)) {
        const filename = folderFilename('schemas', folder, 'json');
        const slice = resolveSlice(spec, { folderPrefix: folder ?? '' });
        const folderSpec = { ...spec, types: Object.fromEntries(slice.types.map((t, i) => [slice.typeKeys[i]!, t])) };
        zip.file(filename, JSON.stringify(toJsonSchemaBundle(folderSpec), null, 2));
      }
    } else {
      zip.file('schemas.json', JSON.stringify(toJsonSchemaBundle(spec), null, 2));
    }
  }

  // Markdown — always folder-split
  if (opts.markdown) {
    for (const ep of spec.endpoints) {
      const path = ep.folder ? `markdown/${ep.folder}/${ep.id}.md` : `markdown/${ep.id}.md`;
      zip.file(path, endpointToMarkdown(ep, spec));
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Returns the set of distinct endpoint folder paths in the spec, plus
 * `undefined` if any endpoint has no folder. Sorted; nested folders included
 * as their own entries (so `auth` and `auth/oauth` are both present if both
 * have endpoints).
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
```

For JSON Schema folder-split: I'm constructing a synthetic `folderSpec` that has only the slice's types so `toJsonSchemaBundle` (which iterates `spec.types`) emits only those. Verify `toJsonSchemaBundle` doesn't depend on `spec.endpoints` (it shouldn't — JSON Schema is type-only).

### `ExportMenu.tsx` — surface the new sub-checkboxes

```tsx
const [opts, setOpts] = useState({
  openapi: { format: 'json' as 'json' | 'yaml', enabled: true, splitByFolder: false },
  jsonschema: { enabled: true, splitByFolder: false },
  markdown: true,
});

async function run() {
  const blob = await buildExportBundle(spec, {
    openapi: opts.openapi.enabled ? { format: opts.openapi.format, splitByFolder: opts.openapi.splitByFolder } : undefined,
    jsonschema: opts.jsonschema.enabled ? { splitByFolder: opts.jsonschema.splitByFolder } : undefined,
    markdown: opts.markdown,
  });
  // ...
}

// JSX:
// OpenAPI selector + nested "Split by folder" checkbox (visible when enabled)
// JSON Schema checkbox + nested "Split by folder" checkbox (visible when enabled)
// Markdown checkbox (no sub-options)
```

### Risks

- **`distinctEndpointFolders` and nested folders** — for `auth/oauth`, both `auth` and `auth/oauth` MIGHT show up if both have endpoints. The split file at `openapi/auth.openapi.json` would include endpoints from `auth/oauth` too (because `folderPrefix: 'auth'` matches descendants per Slice 1). That's the intended semantics ("export the auth subsystem"). The `openapi/auth/oauth.openapi.json` file would be a SUBSET of `openapi/auth.openapi.json`. Some duplication; acceptable.
  - *Alternative*: only include direct-children endpoints in each folder file (so `auth` only contains direct `auth/` endpoints, not `auth/oauth/`). More surgical, but loses the "subsystem" use case for the parent folder.
  - *My pick*: the current approach (include descendants). Document the duplication in the spec.

- **Filename collisions** — `markdown/auth.md` (root endpoint with id "auth") vs `markdown/auth/login.md` (endpoint in the auth folder). The `auth` filename collides with the directory name. Modern zip tools handle this — but worth flagging. Actual collision only happens if a root endpoint has the same ID as a folder name. Add a fixture test for this.

- **`toJsonSchemaBundle(folderSpec)` synthetic spec** — relies on the function being pure-of `spec.endpoints`. If `toJsonSchemaBundle` ever touches endpoints, the synthetic-spec approach breaks. Verify by reading the implementation.

## Done definition

- New `BundleOptions` shape; `bundle.ts` supports folder-split for Markdown (always), OpenAPI (optional), JSON Schema (optional).
- ExportMenu surfaces the new sub-checkboxes.
- Existing single-file outputs still work via `splitByFolder: false`.
- New i18n key `splitByFolder` in en + zh-TW.
- Tests cover folder-split for all 3 formats + mixed-folder fixture.
- All existing tests still pass (with the new `BundleOptions` shape).
- Spec + plan moved to `done/`.
- Branch `plan/bundle-folder-split` (stacked on `plan/per-endpoint-markdown`) ready to push.
