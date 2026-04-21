# Plan — Preserve `x-*` extensions on OpenAPI round-trip (Endpoint-level v1)

Spec: `docs/specs/active/2026-04-22-preserve-openapi-extensions.md`.

Execute on branch `plan/preserve-openapi-extensions` in `.worktrees/preserve-openapi-extensions`. **All git ops inside the worktree.** Four commits (schema bump, importer, exporter, tests+docs) + one archive commit.

## Tasks

### 1. Freeze v3, bump CURRENT_SCHEMA_VERSION to 4, add `Endpoint.extensions`

**New file:** `packages/core/src/schema/versions/v3.ts`.

Copy the current `Spec` shape (and the `Endpoint` / `ObjectType` / etc. it references) into `v3.ts` as `SpecV3` (and any helper types with `V3` suffix if needed to avoid name collision). Model this after the existing `v1.ts` / `v2.ts`:

```ts
// packages/core/src/schema/versions/v3.ts
// Frozen shape of Spec at schemaVersion 3 (before Endpoint.extensions).

import type {
  HttpMethod, TypeDef, ParamDef, ResponseDef, AuthPreset,
  Environment, Assertions, Capture, /* …and any other types that didn't change */
} from '../types';

export interface EndpointV3 {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];
  queryParams: ParamDef[];
  headers: ParamDef[];
  requestBody: TypeDef | null;
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
  // NOTE: no `extensions` field — that's the v4 addition.
}

export interface SpecV3 {
  schemaVersion: 3;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: EndpointV3[];
}
```

Only freeze what actually changed (`Endpoint`). Everything else (`TypeDef`, `ParamDef`, etc.) can be imported from the current `types.ts` since they're unchanged.

**Edit `packages/core/src/schema/types.ts`:**
- Line 1: `export const CURRENT_SCHEMA_VERSION = 3` → `export const CURRENT_SCHEMA_VERSION = 4`.
- In the `Endpoint` interface (around lines 96–112), append one optional field:

```ts
export interface Endpoint {
  // … existing fields …
  assertions?: Assertions;
  captures?: Capture[];
  /**
   * Vendor extensions (`x-*` keys) captured from OpenAPI operations on import
   * and re-emitted unchanged on export. Excludes `x-folder` which is consumed
   * semantically into `folder`. See `docs/rules/spec-versioning.md`.
   */
  extensions?: Record<string, unknown>;
}
```

**Edit `packages/core/src/schema/migrations.ts`:**
- Add an import line for `SpecV3`:

```ts
import type { SpecV3 } from './versions/v3';
```

- Append one migration entry at the end of `MIGRATIONS`:

```ts
{
  from: 3,
  to: 4,
  // v3 → v4: added `extensions?: Record<string, unknown>` on Endpoint. v3
  // has no extensions field, so absence = no extensions, same behavior as
  // v3. Pure version stamp.
  migrate: (spec: SpecV3): Spec =>
    ({ ...spec, schemaVersion: 4 }) as unknown as Spec,
},
```

Verify:
```bash
cd /Users/victorliang/Zwaggen/.worktrees/preserve-openapi-extensions
pnpm --filter @zwaggen/core exec tsc -b
pnpm --filter web exec tsc -b
```

Both must be clean. `schemaVersion: 3` is a `as const` now bumped to `4`; any place that hard-codes `3` as a TS literal (if any — unlikely) must be updated. Grep `grep -n "schemaVersion: 3" packages apps` for leftovers and fix them. Test fixtures that load v3 specs should NOT be edited — they need to keep round-tripping through the migrator to prove the v3→v4 path works.

Commit:
```
feat(core): bump schemaVersion to 4; add Endpoint.extensions for vendor passthrough

v4 introduces an optional `extensions?: Record<string, unknown>` on
Endpoint so OpenAPI `x-*` keys can survive a round-trip. v3 specs
load unchanged — absence of `extensions` means "no extensions", so
the v3 → v4 migrator is a pure version stamp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 2. Importer: capture `x-*` onto `endpoint.extensions`

**File:** `apps/web/src/importers/openapi.ts` — `readOperation` function (around lines 288–398).

Near the existing `x-folder` handling (around line 373), add:

```ts
const extensions: Record<string, unknown> = {};
for (const [k, v] of Object.entries(op)) {
  if (!k.startsWith('x-')) continue;
  if (k === 'x-folder') continue; // consumed by `folder`
  extensions[k] = v;
}
```

In the returned `Endpoint` object, spread or conditionally include:

```ts
const endpoint: Endpoint = {
  id: cryptoRandomId(),
  method: method.toUpperCase() as Endpoint['method'],
  // … existing fields …
  ...(tags && tags.length ? { tags } : {}),
  ...(xFolder ? { folder: xFolder } : {}),
  ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
};
```

Leave `extensions` undefined when nothing matched — don't serialize an empty object. This keeps canonical output clean for specs that have no extensions.

Do NOT iterate extensions at the spec / operation-path / schema / parameter levels — those are out of scope. Only the operation (method-level) object.

Verify:
```bash
pnpm --filter web exec tsc -b
```

Commit:
```
feat(web): capture operation-level x-* extensions in OpenAPI importer

fromOpenApi now copies every x-* key on the operation (except the
semantic x-folder) onto endpoint.extensions. When no extensions
match, the field is left undefined — canonical output is unchanged
for the common case.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 3. Exporter: emit `endpoint.extensions` back onto the operation

**File:** `packages/core/src/exporters/openapi.ts` — the endpoint loop around line 20.

After the existing `if (e.folder) op['x-folder'] = e.folder;` line (around line 37), add:

```ts
if (e.extensions) {
  for (const [k, v] of Object.entries(e.extensions)) {
    op[k] = v;
  }
}
```

Do NOT use `Object.assign(op, e.extensions)` — the explicit per-key loop makes it obvious that existing keys cannot be overridden. Actually — they CAN'T anyway, because extension keys start with `x-` and op's known keys (`summary`, `parameters`, `tags`, `x-folder`, etc.) don't collide except for `x-folder`. But if an extension key did collide with a known key, the exporter should NOT let the extension clobber the known one. Add a defensive check:

```ts
if (e.extensions) {
  for (const [k, v] of Object.entries(e.extensions)) {
    if (k in op) continue; // don't let extensions override Zwaggen-written keys
    op[k] = v;
  }
}
```

Verify:
```bash
pnpm --filter @zwaggen/core exec tsc -b
```

Commit:
```
feat(core): re-emit endpoint.extensions on OpenAPI export

toOpenApi now writes captured x-* keys back onto each operation
object. Defensive: extension keys that collide with Zwaggen-written
keys (including x-folder) are skipped — the internal representation
wins.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 4. Tests + docs

**New test file:** `apps/web/tests/importers/openapi.extensions.test.ts`. Three cases:

```ts
import { describe, expect, it } from 'vitest';
import { fromOpenApi } from '../../src/importers/openapi';

function opDoc(op: Record<string, unknown>) {
  return {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: { '/x': { get: op } },
  };
}

describe('fromOpenApi — x-* extensions on operations', () => {
  it('captures x-codeSamples and x-internal onto endpoint.extensions', () => {
    const doc = opDoc({
      responses: { '200': { description: 'ok' } },
      'x-codeSamples': [{ lang: 'curl', source: 'curl -X GET /x' }],
      'x-internal': true,
    });
    const { spec, warnings } = fromOpenApi(doc);
    expect(warnings).toEqual([]);
    const ep = spec.endpoints[0]!;
    expect(ep.extensions).toEqual({
      'x-codeSamples': [{ lang: 'curl', source: 'curl -X GET /x' }],
      'x-internal': true,
    });
  });

  it('keeps x-folder semantic and does not duplicate into extensions', () => {
    const doc = opDoc({
      responses: { '200': { description: 'ok' } },
      'x-folder': 'admin',
      'x-internal': true,
    });
    const { spec } = fromOpenApi(doc);
    const ep = spec.endpoints[0]!;
    expect(ep.folder).toBe('admin');
    expect(ep.extensions).toEqual({ 'x-internal': true });
    expect(ep.extensions).not.toHaveProperty('x-folder');
  });

  it('leaves extensions undefined when no x-* keys match', () => {
    const doc = opDoc({ responses: { '200': { description: 'ok' } } });
    const { spec } = fromOpenApi(doc);
    expect(spec.endpoints[0]!.extensions).toBeUndefined();
  });
});
```

**New test file:** `apps/web/tests/exporters/openapi.extensions.test.ts`. Three cases:

```ts
import { describe, expect, it } from 'vitest';
import { toOpenApi, emptySpec, type Endpoint } from '@zwaggen/core';

function specWith(endpointPatch: Partial<Endpoint>) {
  const spec = emptySpec();
  spec.endpoints = [{
    id: 'e1', method: 'GET', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: 'inherit',
    ...endpointPatch,
  }];
  return spec;
}

describe('toOpenApi — endpoint.extensions', () => {
  it('re-emits x-* keys onto the operation', () => {
    const doc = toOpenApi(specWith({
      extensions: {
        'x-codeSamples': [{ lang: 'curl', source: 'curl /x' }],
        'x-internal': true,
      },
    }));
    const op = doc.paths['/x'].get;
    expect(op['x-codeSamples']).toEqual([{ lang: 'curl', source: 'curl /x' }]);
    expect(op['x-internal']).toBe(true);
  });

  it('omits extension keys that would collide with Zwaggen-written keys', () => {
    const doc = toOpenApi(specWith({
      folder: 'real-folder',
      extensions: { 'x-folder': 'hijack-attempt' },
    }));
    const op = doc.paths['/x'].get;
    expect(op['x-folder']).toBe('real-folder'); // not clobbered
  });

  it('produces no extension keys when extensions is undefined', () => {
    const doc = toOpenApi(specWith({}));
    const op = doc.paths['/x'].get;
    for (const k of Object.keys(op)) expect(k.startsWith('x-')).toBe(false);
  });
});
```

Note: If `emptySpec` / `Endpoint` aren't re-exported from `@zwaggen/core`, import them from wherever they currently live (`packages/core/src/schema/defaults.ts` / `packages/core/src/schema/types.ts`). Check what existing exporter tests use as reference: `apps/web/tests/exporters/openapi.test.ts`.

**New test:** append to `apps/web/tests/importers/openapi.test.ts` (or create `openapi.roundtrip.extensions.test.ts` if cleaner) — a round-trip test:

```ts
it('round-trip import → export → import preserves endpoint extensions', () => {
  const original = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {
      '/x': {
        get: {
          responses: { '200': { description: 'ok' } },
          'x-codeSamples': [{ lang: 'js', source: 'fetch("/x")' }],
          'x-internal': false,
        },
      },
    },
  };
  const { spec } = fromOpenApi(original);
  const roundTripped = toOpenApi(spec);
  const { spec: respec } = fromOpenApi(roundTripped);
  expect(respec.endpoints[0]!.extensions).toEqual(spec.endpoints[0]!.extensions);
});
```

**Edit `docs/rules/spec-versioning.md`:**

Find the bullet that reads:
```
- **v2 → v3 (2026-04-20):** added `extends?: string[]` to `ObjectType` for multi-parent type inheritance. v2 specs load unchanged because absent `extends` means no inheritance; the loader stamps `schemaVersion: 3` on read.
```

After it, add:
```
- **v3 → v4 (2026-04-22):** added `extensions?: Record<string, unknown>` to `Endpoint` for OpenAPI `x-*` vendor passthrough on round-trip. v3 specs load unchanged because absent `extensions` means no extensions; the loader stamps `schemaVersion: 4` on read.
```

Also bump the "Current version" line at the top:
```
- **Current version:** `3`.
```
to:
```
- **Current version:** `4`.
```

Run:
```bash
pnpm --filter web test 2>&1 | tee /tmp/pxe.log
grep -cE "An update to|wrapped in act" /tmp/pxe.log
pnpm --filter @zwaggen/core test 2>&1 | tee /tmp/pxe-core.log
```

Both suites must be green. 0 act warnings on the web suite. No regressions in core suite. Also grep for any failing test that loaded a v3-era fixture expecting `schemaVersion: 3` on the output — if the migration fixture tests exist, they need to be updated to expect `4` for the output of `fromJSON`.

Commit:
```
test(web): cover x-* extension capture + round-trip + docs rule entry

Three new test files (importer + exporter + round-trip) cover the
v4 extensions feature. docs/rules/spec-versioning.md gains the v3
→ v4 bullet and the Current version line bumps to 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 5. Archive + tick TODO

Single commit inside the worktree:

- `git mv docs/specs/active/2026-04-22-preserve-openapi-extensions.md docs/specs/done/`
- `git mv docs/plans/active/2026-04-22-preserve-openapi-extensions.md docs/plans/done/`
- In `docs/TODO.md`, under `## Follow-up from shipped work`, flip `- [ ] Preserve x-* extensions in OpenAPI importer` to `- [x] ... — see docs/plans/done/2026-04-22-preserve-openapi-extensions.md.` — keep the style matching the line just above it.
- Bump `Last updated:` to `2026-04-22 (preserve-openapi-extensions)`.

```
docs: ship preserve-openapi-extensions — move spec+plan to done, tick TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Execution strategy

Four implementer commits (tasks 1–4) dispatched as ONE implementer subagent — they're tightly coupled (schema → importer → exporter → tests all need to be coherent). Spec-compliance + code-quality reviews after. One archive subagent. Master session FF-merges and asks before push.
