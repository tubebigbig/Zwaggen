# Bundle export: folder-split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle export's Markdown becomes always-folder-split (`markdown/{folder}/{endpoint-id}.md`); OpenAPI and JSON Schema gain an optional "Split by folder" checkbox that emits per-folder slice files via Slice 1's closure walker.

**Architecture:** New `BundleOptions` shape (objects-with-flags instead of flat values). One pure helper `distinctEndpointFolders(spec)`. Markdown uses `endpointToMarkdown` (just shipped). OpenAPI + JSON Schema reuse `resolveSlice` / `toOpenApi(opts.only.folderPrefix)`. ExportMenu surfaces the new sub-checkboxes.

**Tech Stack:** TypeScript, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-28-bundle-folder-split.md`.

---

### Task 1: Refactor `BundleOptions` shape + folder-split logic in `bundle.ts`

**Files:**
- Modify: `apps/web/src/exporters/bundle.ts` — new options shape; folder-split branches for markdown/openapi/jsonschema; helper `distinctEndpointFolders`.
- Modify: `apps/web/tests/exporters/bundle.test.ts` — update existing tests to use the new options shape.
- Create: `apps/web/tests/exporters/bundle.folderSplit.test.ts` — new tests for folder-split behavior.

- [ ] **Step 1: Define new `BundleOptions` + helpers**

Replace `apps/web/src/exporters/bundle.ts` body with:

```ts
import JSZip from 'jszip';
import YAML from 'yaml';
import { resolveSlice, toJSON, type Spec } from '@zwaggen/core';
import { toOpenApi } from './openapi';
import { toJsonSchemaBundle } from './jsonschema';
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

  // JSON Schema
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

  // Markdown — always folder-split (no single-file option).
  if (opts.markdown) {
    for (const ep of spec.endpoints) {
      const path = ep.folder ? `markdown/${ep.folder}/${ep.id}.md` : `markdown/${ep.id}.md`;
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
```

- [ ] **Step 2: Verify `toJsonSchemaBundle` purity**

```bash
grep -n "spec\.endpoints\|spec\.info" apps/web/src/exporters/jsonschema.ts
```

If `toJsonSchemaBundle` references `spec.endpoints`, the synthetic-spec approach breaks. Likely it only iterates `spec.types` (JSON Schema is type-only). Verify and report.

- [ ] **Step 3: Update existing `bundle.test.ts`**

The existing tests use the OLD options shape (e.g., `{ openapi: 'json', jsonschema: true, markdown: true }`). Update each test call to use the NEW shape:

- `{ openapi: 'json' }` → `{ openapi: { format: 'json' } }`
- `{ jsonschema: true }` → `{ jsonschema: {} }`
- `{ markdown: true }` → `{ markdown: true }` (unchanged)

The "always includes canonical JSON" test should pass — `spec.zwag` is always emitted.

The "supports all formats" test now needs to assert NEW filenames. With markdown always folder-split and the empty spec having no endpoints, `markdown/...` directory is empty → no file added. The test's `expect(zip.file('api.md')).not.toBeNull()` becomes `expect(zip.file('spec.zwag')).not.toBeNull()` plus a new assertion that there's no `api.md`. (Make sure the fixture has at least one endpoint if you want to assert markdown content.)

- [ ] **Step 4: New folder-split tests**

`apps/web/tests/exporters/bundle.folderSplit.test.ts`:

```ts
import { test, expect } from 'vitest';
import JSZip from 'jszip';
import { buildExportBundle } from '../../src/exporters/bundle';
import { emptySpec, type RefType } from '@zwaggen/core';

function multiFolderSpec() {
  const s = emptySpec('Multi');
  s.types['User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  s.types['auth/Token'] = { kind: 'object', fields: [{ name: 'value', required: true, type: { kind: 'string' } }] };
  s.endpoints = [
    { id: 'getRoot', method: 'GET', path: '/', pathParams: [], requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
      auth: 'inherit', useProxy: 'inherit' },
    { id: 'login', method: 'POST', path: '/login', pathParams: [], requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/Token' } as RefType }],
      auth: 'inherit', useProxy: 'inherit', folder: 'auth' },
    { id: 'oauthCallback', method: 'GET', path: '/auth/callback', pathParams: [], requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/Token' } as RefType }],
      auth: 'inherit', useProxy: 'inherit', folder: 'auth/oauth' },
  ];
  return s;
}

test('markdown is always folder-split — one file per endpoint', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), { markdown: true });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('markdown/getRoot.md')).not.toBeNull();
  expect(zip.file('markdown/auth/login.md')).not.toBeNull();
  expect(zip.file('markdown/auth/oauth/oauthCallback.md')).not.toBeNull();
  expect(zip.file('api.md')).toBeNull();  // old single-file is gone
});

test('openapi single-file (default)', async () => {
  const blob = await buildExportBundle(multiFolderSpec(), { openapi: { format: 'json' } });
  const zip = await JSZip.loadAsync(blob);
  expect(zip.file('openapi.json')).not.toBeNull();
  expect(zip.folder('openapi')?.file(/.+/)).toEqual([]);
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
```

(Adjust assertions if `JSZip.folder().file(pattern)` API differs — fall back to listing all entries via `zip.files` and asserting paths.)

- [ ] **Step 5: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/bundle-folder-split
pnpm install   # if node_modules empty
pnpm --filter web test tests/exporters/bundle.folderSplit.test.ts tests/exporters/bundle.test.ts
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

All green. Test count up by ~6 new + the rewritten existing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/exporters/bundle.ts apps/web/tests/exporters/bundle.test.ts apps/web/tests/exporters/bundle.folderSplit.test.ts
git commit -m "$(cat <<'EOF'
feat(web): bundle export — folder-split for markdown/openapi/jsonschema

- Markdown is always folder-split: one .md file per endpoint at
  markdown/{folder}/{endpoint-id}.md (uses endpointToMarkdown from
  the per-endpoint-markdown slice). The full-spec api.md is
  removed.
- OpenAPI gains a splitByFolder option: when on, emits
  openapi/{folder}.openapi.{json|yaml} per endpoint folder using
  Slice 1's resolveSlice closure. Off (default) keeps the existing
  single-file output.
- JSON Schema gains the same option: schemas/{folder}.schemas.json
  per folder. Off keeps the existing single-file output.
- BundleOptions shape changed from flat values to objects-with-flags;
  ExportMenu (next commit) updates its call site accordingly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ExportMenu — surface the new sub-checkboxes + i18n

**Files:**
- Modify: `apps/web/src/ui/ExportMenu.tsx` — restructure state to match new BundleOptions; add Split by folder sub-checkboxes.
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — add `splitByFolder` key.
- (Optional) Add a test: `apps/web/tests/ui/ExportMenu.test.tsx` — checkbox toggles state + run() calls buildExportBundle with the right options.

- [ ] **Step 1: i18n keys**

`en.json`:
```json
"splitByFolder": "Split by folder"
```

`zh-TW.json`:
```json
"splitByFolder": "依資料夾分割"
```

- [ ] **Step 2: ExportMenu state + UI**

Replace the existing `useState({ openapi, jsonschema, markdown })` shape with:

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
  downloadBlob(blob, `${spec.info.name.replace(/\s+/g, '-')}.zwaggen.zip`);
}
```

For the OpenAPI selector: keep the existing format dropdown (`json` / `yaml` / `off`), but `off` now flips `enabled: false` rather than setting format to `'off'`. Add a sibling indented checkbox for `splitByFolder` (visible when `enabled === true`).

For JSON Schema: keep the existing checkbox (now flipping `jsonschema.enabled`); add a sibling indented `splitByFolder` checkbox (visible when enabled).

For Markdown: stay a single checkbox (no sub-options).

JSX sketch:

```tsx
<label className="flex items-center justify-between">
  <span className="text-xs font-medium text-slate-600">OpenAPI</span>
  <select
    className="select text-xs"
    value={opts.openapi.enabled ? opts.openapi.format : 'off'}
    onChange={(e) => {
      const v = e.target.value;
      if (v === 'off') setOpts({ ...opts, openapi: { ...opts.openapi, enabled: false } });
      else setOpts({ ...opts, openapi: { ...opts.openapi, enabled: true, format: v as 'json' | 'yaml' } });
    }}
  >
    <option value="json">JSON</option>
    <option value="yaml">YAML</option>
    <option value="off">off</option>
  </select>
</label>
{opts.openapi.enabled && (
  <label className="flex items-center gap-2 pl-4 text-xs text-slate-700">
    <input
      type="checkbox"
      checked={opts.openapi.splitByFolder}
      onChange={(e) => setOpts({ ...opts, openapi: { ...opts.openapi, splitByFolder: e.target.checked } })}
    />
    {t('splitByFolder')}
  </label>
)}

{/* JSON Schema */}
<label className="flex items-center gap-2 text-xs text-slate-700">
  <input
    type="checkbox"
    checked={opts.jsonschema.enabled}
    onChange={(e) => setOpts({ ...opts, jsonschema: { ...opts.jsonschema, enabled: e.target.checked } })}
  />
  JSON Schema
</label>
{opts.jsonschema.enabled && (
  <label className="flex items-center gap-2 pl-4 text-xs text-slate-700">
    <input
      type="checkbox"
      checked={opts.jsonschema.splitByFolder}
      onChange={(e) => setOpts({ ...opts, jsonschema: { ...opts.jsonschema, splitByFolder: e.target.checked } })}
    />
    {t('splitByFolder')}
  </label>
)}

{/* Markdown — single toggle, no sub-options */}
<label className="flex items-center gap-2 text-xs text-slate-700">
  <input
    type="checkbox"
    checked={opts.markdown}
    onChange={(e) => setOpts({ ...opts, markdown: e.target.checked })}
  />
  Markdown
</label>
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

All green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/ui/ExportMenu.tsx apps/web/src/i18n/locales
git commit -m "$(cat <<'EOF'
feat(web): ExportMenu surfaces "Split by folder" sub-checkbox for OpenAPI + JSON Schema

OpenAPI and JSON Schema each get an indented "Split by folder"
checkbox visible when the format itself is enabled. Markdown stays
a single toggle (always folder-split, no sub-options).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move spec/plan + final smoke

- [ ] **Step 1: Move + smoke**

```bash
git mv docs/specs/active/2026-04-28-bundle-folder-split.md docs/specs/done/
git mv docs/plans/active/2026-04-28-bundle-folder-split.md docs/plans/done/
pnpm --filter @zwaggen/core build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ship bundle-folder-split — move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- `BundleOptions` shape updated; `bundle.ts` handles all 3 formats with folder-split.
- ExportMenu surfaces the new sub-checkboxes; markdown stays a single toggle.
- 6+ folder-split tests + updated existing tests pass.
- 1 new i18n key in en + zh-TW.
- Branch `plan/bundle-folder-split` (stacked on `plan/per-endpoint-markdown`) ready.
