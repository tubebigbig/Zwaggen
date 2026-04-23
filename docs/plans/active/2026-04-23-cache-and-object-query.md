# Cache header fix + object-typed query/header param expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two bundled fixes — (1) one-line `_headers` change so HTML always revalidates after deploy, (2) object-typed query/header params expand into per-field rows in the Run panel and per-key serialization on the wire (matches OpenAPI 3 default `style=form, explode=true`).

**Architecture:** Cache fix is a one-line YAML edit. Object expansion centers on a new `expandParam` helper in `@zwaggen/core`, used by RunPanel + codegen + OpenAPI exporter. Schema unchanged. Runner unchanged.

**Tech Stack:** Existing — no new deps.

---

### Spec

See `docs/specs/active/2026-04-23-cache-and-object-query.md`. Key constraints:

- No schema bump (TypeDef union already covers everything).
- One level of object expansion only (nested-of-nested stays as-is).
- Importer doesn't reassemble in v1 (each expanded param imports as flat).
- Path params: still rejected for object types (no UI/runner change here, just don't expand).

---

### Task 1: Cache header fix

**Files:**
- Modify: `apps/web/public/_headers`

- [ ] **Step 1: Edit the HTML rule + add rationale comment**

Replace the existing `/*` block:

```
# HTML and everything else — always revalidate, but cache the bytes
# (after revalidation the server returns 304 if unchanged → fast). This
# prevents post-deploy "blank page" where stale HTML refers to assets
# CF has already purged. Edge cache stays a day; CF Pages auto-purges
# the edge on every new deployment.
/*
  Cache-Control: public, no-cache, must-revalidate
  CDN-Cache-Control: public, max-age=86400
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: interest-cohort=()
  Content-Security-Policy: default-src 'self'; script-src 'self' static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' http: https: cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/public/_headers
git commit -m "$(cat <<'EOF'
fix(web): switch HTML cache to no-cache + must-revalidate

Stops post-deploy "blank page" where stale HTML for up to 5 minutes
referenced assets CF had already purged. no-cache means "always
revalidate" — browser sends If-None-Match and gets a 304 if unchanged
(~200 bytes), so caching is preserved for unchanged content. Hashed
assets keep their year-long immutable cache.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `expandParam` helper in `@zwaggen/core`

**Files:**
- Create: `packages/core/src/runner/expandParam.ts`
- Modify: `packages/core/src/index.ts` — re-export.
- Create: `packages/core/tests/runner/expandParam.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { expandParam } from '../../src/runner/expandParam';
import { emptySpec } from '../../src/schema/defaults';

test('non-object param passes through unchanged', () => {
  const param = { name: 'q', required: true, type: { kind: 'string' } } as const;
  expect(expandParam(param, emptySpec())).toEqual([param]);
});

test('inline-object param expands to fields', () => {
  const param = {
    name: 'filter', required: true,
    type: { kind: 'object', fields: [
      { name: 'status', required: true, type: { kind: 'string' } },
      { name: 'category', required: false, type: { kind: 'string' } },
    ] },
  } as const;
  const out = expandParam(param, emptySpec());
  expect(out).toEqual([
    { name: 'status', required: true, type: { kind: 'string' }, description: undefined },
    { name: 'category', required: false, type: { kind: 'string' }, description: undefined },
  ]);
});

test('ref-to-object param resolves and expands', () => {
  const spec = {
    ...emptySpec(),
    types: {
      Filter: { kind: 'object', fields: [
        { name: 'status', required: true, type: { kind: 'string' } },
      ] },
    },
  };
  const out = expandParam({ name: 'q', required: true, type: { kind: 'ref', ref: 'Filter' } }, spec);
  expect(out).toEqual([
    { name: 'status', required: true, type: { kind: 'string' }, description: undefined },
  ]);
});

test('expanded field is required only if BOTH the param AND the field are required', () => {
  const spec = {
    ...emptySpec(),
    types: {
      Filter: { kind: 'object', fields: [
        { name: 'status', required: true, type: { kind: 'string' } },
      ] },
    },
  };
  const out = expandParam({ name: 'q', required: false, type: { kind: 'ref', ref: 'Filter' } }, spec);
  expect(out[0]!.required).toBe(false);
});

test('ref to a non-object passes through unchanged', () => {
  const spec = {
    ...emptySpec(),
    types: { Status: { kind: 'string', enum: ['active'] } },
  };
  const param = { name: 'q', required: true, type: { kind: 'ref', ref: 'Status' } } as const;
  expect(expandParam(param, spec)).toEqual([param]);
});
```

- [ ] **Step 2: Implement**

```ts
// packages/core/src/runner/expandParam.ts
import type { Spec, ParamDef, TypeDef, ObjectType } from '../schema/types';

function resolveToObject(type: TypeDef, spec: Spec): ObjectType | null {
  if (type.kind === 'object') return type;
  if (type.kind === 'ref') {
    const target = spec.types[type.ref];
    if (target?.kind === 'object') return target;
  }
  return null;
}

/**
 * Expand an object-typed ParamDef into one synthetic ParamDef per field
 * (form/explode semantics — matches OpenAPI 3 default for object-typed
 * query and header params). Refs are dereferenced via `spec.types`.
 *
 * Non-object params pass through unchanged.
 *
 * Only one level of expansion: nested object fields keep their type
 * verbatim and the UI/runner stringifies their values.
 */
export function expandParam(param: ParamDef, spec: Spec): ParamDef[] {
  const obj = resolveToObject(param.type, spec);
  if (!obj) return [param];
  return obj.fields.map((f) => ({
    name: f.name,
    required: f.required && param.required,
    type: f.type,
    description: f.description,
  }));
}
```

Re-export in `packages/core/src/index.ts`:

```ts
export * from './runner/expandParam';
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @zwaggen/core test
git add packages/core/src/runner/expandParam.ts packages/core/src/index.ts packages/core/tests/runner/expandParam.test.ts
git commit -m "$(cat <<'EOF'
feat(core): expandParam — flatten object-typed query/header params

Returns one synthetic ParamDef per field of the resolved object (or
the input param unchanged for non-object types). Used by RunPanel +
codegen + OpenAPI exporter to implement form/explode semantics for
object-typed query and header params.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: RunPanel — render expanded params

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Create: `apps/web/tests/ui/RunPanel.objectQuery.test.tsx`

- [ ] **Step 1: Wrap query + header param lists with `expandParam`**

Add the import at the top:

```ts
import { expandParam } from '@zwaggen/core';
```

In the RunPanel component body (near the existing param-vals state):

```tsx
const expandedQuery = useMemo(
  () => endpoint.queryParams.flatMap((p) => expandParam(p, spec)),
  [endpoint.queryParams, spec],
);
const expandedHeaders = useMemo(
  () => endpoint.headers.flatMap((p) => expandParam(p, spec)),
  [endpoint.headers, spec],
);
```

Update the `<ParamInputs>` calls:

```tsx
{expandedQuery.length > 0 && (
  <ParamInputs label={t('query')} params={expandedQuery} values={queryVals} onChange={setQueryVals} />
)}
{expandedHeaders.length > 0 && (
  <ParamInputs label={t('headers')} params={expandedHeaders} values={headerVals} onChange={setHeaderVals} />
)}
```

(Replace the existing `endpoint.queryParams.length > 0` / `endpoint.headers.length > 0` checks with the expanded versions.)

- [ ] **Step 2: Pre-populate from `example`**

In the existing endpoint-change effect (the one that resets `pathVals`/`queryVals`/etc. when the endpoint changes), add example seeding:

```tsx
useEffect(() => {
  // ... existing resets ...
  const seedQuery: Record<string, string> = {};
  for (const p of endpoint.queryParams) {
    const obj = (p.type.kind === 'object' && p.type.example && typeof p.type.example === 'object')
      ? p.type.example as Record<string, unknown>
      : (p.type.kind === 'ref' && spec.types[p.type.ref]?.kind === 'object'
        ? (spec.types[p.type.ref] as ObjectType).example as Record<string, unknown> | undefined
        : undefined);
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null) seedQuery[k] = String(v);
      }
    }
  }
  setQueryVals(seedQuery);
  // ... same shape for headers if useful ...
}, [endpoint.id]);
```

Don't seed if a value is already user-typed — add the seed only when `queryVals` for that key is undefined. (Tweak per existing reset semantics.)

- [ ] **Step 3: Test**

```tsx
test('object-typed query param renders one row per field', async () => {
  const spec = {
    ...emptySpec(),
    info: { ...emptySpec().info, baseUrl: 'http://api' },
    types: {
      Filter: {
        kind: 'object',
        example: { status: 'active', category: 'widgets' },
        fields: [
          { name: 'status', required: true, type: { kind: 'string' } },
          { name: 'category', required: false, type: { kind: 'string' } },
        ],
      },
    },
    endpoints: [{
      id: 'list', method: 'GET', path: '/items', tags: ['default'],
      pathParams: [],
      queryParams: [{ name: 'filter', required: true, type: { kind: 'ref', ref: 'Filter' } }],
      headers: [], requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    }],
  };
  // render <RunPanel endpoint={endpoint} ... />
  // assert: TWO inputs labeled "status" and "category"
  // assert: pre-populated values from example ("active" and "widgets")
});

test('object-typed query param produces multi-key URL on Run', async () => {
  // mock fetch
  // render + change values + click Run
  // assert fetch was called with URL containing ?status=...&category=...
});
```

- [ ] **Step 4: Commit**

```bash
pnpm --filter web test
pnpm --filter web lint
git add apps/web/src/ui/RunPanel.tsx apps/web/tests/ui/RunPanel.objectQuery.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): RunPanel expands object-typed query/header params into per-field rows

Each ref or inline-object query/header param now renders one row per
field of the resolved object, pre-populated from the type's example.
The ParamDef's name becomes a developer-facing label only — the URL
uses the field names as keys (form/explode semantics, OpenAPI 3
default).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Codegen — flatten object-typed query/header in input type

**Files:**
- Modify: `packages/cli/src/generate/client.ts`
- Modify: `packages/cli/tests/generate/client.test.ts`

- [ ] **Step 1: Failing test**

```ts
test('object-typed query param flattens in client input', () => {
  const spec = {
    ...emptySpec(),
    info: { ...emptySpec().info, baseUrl: 'http://api' },
    types: {
      Filter: { kind: 'object', fields: [
        { name: 'status', required: true, type: { kind: 'string' } },
        { name: 'category', required: false, type: { kind: 'string' } },
      ] },
    },
    endpoints: [{
      id: 'list', method: 'GET', path: '/items', tags: ['default'],
      pathParams: [],
      queryParams: [{ name: 'filter', required: true, type: { kind: 'ref', ref: 'Filter' } }],
      headers: [], requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    }],
  };
  const out = generateClient(spec);
  // The query input should be { status: string; category?: string }, not { filter: Filter }
  expect(out).toContain('status: string');
  expect(out).toContain('category?: string');
  expect(out).not.toContain('filter: Filter');
});
```

- [ ] **Step 2: Update `inputTypeFor`**

Find the queryParams + headers branches in `inputTypeFor`. Wrap with `expandParam`:

```ts
import { expandParam } from '@zwaggen/core';

function inputTypeFor(endpoint: Endpoint, spec: Spec): string {
  const parts: string[] = [];
  if (endpoint.pathParams.length > 0) {
    const fields = endpoint.pathParams.map((p) => `${safeIdentifier(p.name)}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ ${fields} }`);
  }
  if (endpoint.queryParams.length > 0) {
    const expanded = endpoint.queryParams.flatMap((p) => expandParam(p, spec));
    if (expanded.length > 0) {
      const fields = expanded.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
      parts.push(`{ ${fields} }`);
    }
  }
  if (endpoint.headers.length > 0) {
    const expanded = endpoint.headers.flatMap((p) => expandParam(p, spec));
    if (expanded.length > 0) {
      const fields = expanded.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
      parts.push(`{ ${fields} }`);
    }
  }
  // body unchanged
  // ...
}
```

The fetch-options builder (`buildUrlExpr` + `buildFetchOptsExpr`) already iterates `endpoint.queryParams.map(p => input[p.name])` etc. **Update those too** to use the expanded list:

```ts
function buildUrlExpr(endpoint: Endpoint, spec: Spec): string {
  const expandedQuery = endpoint.queryParams.flatMap((p) => expandParam(p, spec));
  // ... use expandedQuery instead of endpoint.queryParams ...
}
```

Same for headers.

- [ ] **Step 3: Tests pass**

```bash
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
```

Existing v1/v1.1 fixtures may have query/header params — most are flat strings; if any are object-typed, the goldens will need updating. Run the suite, inspect any diff.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/generate/client.ts packages/cli/tests/generate/
git commit -m "$(cat <<'EOF'
feat(cli/codegen): flatten object-typed query/header params via expandParam

Generated client method's input.query and input.headers shapes now
reflect the expanded fields (e.g. { status: string; category?: string }
instead of { filter: Filter }) — matches the runtime URL semantics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: OpenAPI exporter — emit expanded params

**Files:**
- Modify: `packages/core/src/exporters/openapi.ts`
- Modify: `packages/core/tests/exporters/openapi.test.ts`

- [ ] **Step 1: Failing test**

```ts
test('object-typed query param exports as multiple OpenAPI param entries', () => {
  const spec = {
    ...emptySpec(),
    types: {
      Filter: { kind: 'object', fields: [
        { name: 'status', required: true, type: { kind: 'string' } },
      ] },
    },
    endpoints: [{
      id: 'e', method: 'GET', path: '/x', tags: [],
      pathParams: [],
      queryParams: [{ name: 'filter', required: true, type: { kind: 'ref', ref: 'Filter' } }],
      headers: [], requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    }],
  };
  const oapi = toOpenApi(spec);
  const params = oapi.paths['/x'].get.parameters;
  expect(params.length).toBeGreaterThanOrEqual(1);
  expect(params.find((p: any) => p.name === 'status' && p.in === 'query')).toBeDefined();
  expect(params.find((p: any) => p.name === 'filter' && p.in === 'query')).toBeUndefined();
});
```

- [ ] **Step 2: Update the exporter**

Find where the exporter builds the operation's `parameters` array. For each query/header ParamDef, expand via `expandParam(p, spec)` and emit each field as a separate entry:

```ts
import { expandParam } from '../runner/expandParam';

// ...
const queryEntries = endpoint.queryParams.flatMap((p) => expandParam(p, spec));
const headerEntries = endpoint.headers.flatMap((p) => expandParam(p, spec));
// ... existing path emission unchanged ...
```

Each expanded entry emits as `{ name, in: 'query' | 'header', required, schema: typeDefToOpenApi(p.type) }`. OpenAPI defaults (style=form, explode=true for query) match what we want; for headers explicitly set `explode: true` since simple/explode=false is the default.

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @zwaggen/core test
git add packages/core/src/exporters/openapi.ts packages/core/tests/exporters/openapi.test.ts
git commit -m "$(cat <<'EOF'
feat(core/openapi): emit expanded params for object-typed query/header

Each object-typed query or header ParamDef exports as N OpenAPI param
entries (one per field of the resolved object), matching the runtime
form/explode serialization. Importer continues to read each entry as
a flat ParamDef in v1 (no reassembly).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Documentation update

**Files:**
- Modify: `apps/docs/guide/endpoints.md`
- Modify: `apps/docs/zh-TW/guide/endpoints.md`

- [ ] **Step 1: en — append paragraph**

Find the "Query / header / cookie params" section. Append:

```markdown
**Object-typed query and header params expand into per-field rows.** When a param's type is a `ref` to an object (or an inline object), the runner serializes each field of the object as its own query key (`?status=active&category=widgets`), matching OpenAPI 3's default `style=form, explode=true`. The ParamDef's `name` becomes a developer-facing label only — it doesn't appear in the URL. Use a flat `string` / `number` / `boolean` type if you need the param name to be the actual key.
```

- [ ] **Step 2: zh-TW — same paragraph**

```markdown
**物件型別的 query/header 參數會展開成逐欄位列。** 當參數的型別是某個 object 的 `ref`(或內聯 object)時,執行器會把該 object 的每個欄位當作獨立的 query key 序列化(`?status=active&category=widgets`),這與 OpenAPI 3 的預設 `style=form, explode=true` 一致。ParamDef 的 `name` 只作為開發介面上的標籤,不會出現在 URL 裡。如果你希望參數名就是實際的 key,請直接使用 `string` / `number` / `boolean` 等扁平型別。
```

- [ ] **Step 3: Commit**

```bash
pnpm --filter docs build
git add apps/docs/
git commit -m "$(cat <<'EOF'
docs: document object-typed query/header param expansion

Both locales' endpoints guide now explains the new form/explode
semantics so users know which behaviour to expect.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Tick TODO + log per-param style follow-up + move spec/plan

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Final sweep**

```bash
pnpm install
pnpm --filter @zwaggen/core test
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter docs build
```

Every step green.

- [ ] **Step 2: Tick the cache TODO**

Find the existing entry for the play.zwaggen.com cache bug (added in 0f1af19) and tick it. Add a description of the fix.

Add a new ticked entry for the object-query expansion:

```
- [x] Object-typed query/header params expand into per-field rows — `expandParam` helper used by RunPanel, codegen, and OpenAPI exporter. Form/explode semantics (OpenAPI 3 default). See `docs/plans/done/2026-04-23-cache-and-object-query.md`.
```

Add a new follow-up (open):

```
- [ ] Per-param style override for object-typed query — `style: 'deepObject'` (Stripe / JSON:API) and `style: 'json'` (single-key JSON) for users who don't want form/explode. v1 hard-codes form/explode. Surfaced from the object-query expansion slice.
```

Update "Last updated" stamp.

- [ ] **Step 3: Move spec + plan to done/**

```bash
git mv docs/specs/active/2026-04-23-cache-and-object-query.md docs/specs/done/
git mv docs/plans/active/2026-04-23-cache-and-object-query.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship cache-and-object-query — tick TODO + log style-override follow-up

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 7 tasks ticked.
- `_headers` HTML rule is `no-cache, must-revalidate`.
- `expandParam` lives in `@zwaggen/core` with re-export.
- RunPanel renders per-field rows for object-typed query/header params, pre-populated from the type's example.
- Codegen `inputTypeFor` flattens.
- OpenAPI exporter emits expanded entries.
- Both locales' docs updated.
- All test suites green.
- Branch `plan/cache-and-object-query` ready to push.
