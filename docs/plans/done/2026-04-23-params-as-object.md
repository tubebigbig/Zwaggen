# Query and header params as ObjectType (v7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the dual-tier model (flat ParamDef vs object-typed ParamDef) into a single uniform model where `endpoint.queryParams` and `endpoint.headers` are an ObjectType (or ref to one). Delete `expandParam` since it's no longer needed.

**Architecture:** Schema bump v6 → v7 with a real (lossless) migration that wraps `ParamDef[]` into `{ kind: 'object', fields: [...] }`. New `resolveParamFields(target, spec)` helper replaces every call site of `expandParam`. EndpointEditor gains an inline / ref / none toggle. Runner is unchanged (only consumes `inputs.*`).

**Tech Stack:** Existing — no new deps.

---

### Spec

See `docs/specs/active/2026-04-23-params-as-object.md`. Key constraints:

- `pathParams: ParamDef[]` stays (positional, tied to URL templates).
- `bodyForm: ParamDef[]` stays in v7 (FileType placement makes the migration awkward; defer to v8).
- All existing v1+ test fixtures load via `fromJSON` so the migration is transparent. Direct in-test spec construction needs to use the new v7 shape.

---

### Task 1: Schema v7 — types + migration + v6 snapshot + tests

**Files:**
- Modify: `packages/core/src/schema/types.ts` — bump to 7; change Endpoint's queryParams/headers types.
- Create: `packages/core/src/schema/versions/v6.ts` — snapshot.
- Modify: `packages/core/src/schema/migrations.ts` — append v6 → v7 migrator.
- Modify: `packages/core/tests/schema/migrations.test.ts` — add v6 → v7 case.

- [ ] **Step 1: Snapshot v6 + bump version + change Endpoint shape**

`packages/core/src/schema/versions/v6.ts`:

```ts
import type {
  AuthPreset, Assertions, Capture, HttpMethod, ResponseDef, ParamDef, TypeDef,
  Environment, BodyContentType,
} from '../types';

export interface EndpointV6 {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];
  queryParams: ParamDef[];
  headers: ParamDef[];
  requestBody: TypeDef | null;
  bodyContentType?: BodyContentType;
  bodyForm?: ParamDef[];
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
  extensions?: Record<string, unknown>;
}

export interface SpecV6 {
  schemaVersion: 6;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: EndpointV6[];
}
```

In `packages/core/src/schema/types.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 7 as const;

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];                          // unchanged
  queryParams?: ObjectType | RefType;              // CHANGED
  headers?: ObjectType | RefType;                  // CHANGED
  requestBody: TypeDef | null;
  bodyContentType?: BodyContentType;
  bodyForm?: ParamDef[];
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
  extensions?: Record<string, unknown>;
}
```

- [ ] **Step 2: Append v6 → v7 migrator**

In `packages/core/src/schema/migrations.ts`:

```ts
import type { SpecV6 } from './versions/v6';

// ...
{
  from: 6,
  to: 7,
  migrate: (v6: SpecV6): Spec => ({
    ...v6,
    schemaVersion: 7,
    endpoints: v6.endpoints.map((ep) => {
      const next: any = { ...ep };
      if (ep.queryParams && ep.queryParams.length > 0) {
        next.queryParams = {
          kind: 'object',
          fields: ep.queryParams.map((p) => ({
            name: p.name,
            required: p.required,
            type: p.type,
            ...(p.description !== undefined ? { description: p.description } : {}),
          })),
        };
      } else {
        delete next.queryParams;
      }
      if (ep.headers && ep.headers.length > 0) {
        next.headers = {
          kind: 'object',
          fields: ep.headers.map((p) => ({
            name: p.name,
            required: p.required,
            type: p.type,
            ...(p.description !== undefined ? { description: p.description } : {}),
          })),
        };
      } else {
        delete next.headers;
      }
      return next as Spec['endpoints'][number];
    }),
  }) as unknown as Spec,
},
```

- [ ] **Step 3: Migration test**

```ts
test('v6 spec migrates query/header ParamDef[] to ObjectType.fields', () => {
  const v6 = {
    schemaVersion: 6,
    info: { name: 'X' },
    types: {},
    environments: { default: { variables: [] } },
    activeEnvironment: 'default',
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [{
      id: 'e', method: 'GET', path: '/x',
      pathParams: [],
      queryParams: [
        { name: 'page', required: true, type: { kind: 'integer' } },
        { name: 'limit', required: false, type: { kind: 'integer' } },
      ],
      headers: [{ name: 'X-Trace', required: false, type: { kind: 'string' } }],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    }],
  } as any;
  const v7 = fromJSON(v6);
  expect(v7.schemaVersion).toBe(7);
  expect(v7.endpoints[0].queryParams).toEqual({
    kind: 'object',
    fields: [
      { name: 'page', required: true, type: { kind: 'integer' } },
      { name: 'limit', required: false, type: { kind: 'integer' } },
    ],
  });
  expect(v7.endpoints[0].headers).toEqual({
    kind: 'object',
    fields: [{ name: 'X-Trace', required: false, type: { kind: 'string' } }],
  });
});

test('v6 endpoint with empty query/header arrays migrates to undefined', () => {
  const v6 = { /* ... empty arrays ... */ };
  const v7 = fromJSON(v6);
  expect(v7.endpoints[0].queryParams).toBeUndefined();
  expect(v7.endpoints[0].headers).toBeUndefined();
});
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @zwaggen/core test
```

Many existing tests will break here because `endpoint.queryParams` is no longer always an array. That's expected — Tasks 2-7 fix them.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema/types.ts packages/core/src/schema/versions/v6.ts packages/core/src/schema/migrations.ts packages/core/tests/schema/migrations.test.ts
git commit -m "$(cat <<'EOF'
feat(core/schema): bump to v7 — query and header params as ObjectType

queryParams and headers on Endpoint change from ParamDef[] to
ObjectType | RefType | undefined. Migration wraps existing arrays into
inline objects (or omits when empty). Lossless because ParamDef and
ObjectField share the same { name; required; type; description? } shape.

Downstream call sites (runner, RunPanel, codegen, openapi) follow in
subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Tests stay broken until later tasks land — that's fine within a TDD-style sequence.)

---

### Task 2: `resolveParamFields` helper + delete `expandParam`

**Files:**
- Create: `packages/core/src/runner/resolveParamFields.ts`
- Modify: `packages/core/src/index.ts` — re-export new helper, remove old.
- Delete: `packages/core/src/runner/expandParam.ts`
- Delete: `packages/core/tests/runner/expandParam.test.ts`
- Create: `packages/core/tests/runner/resolveParamFields.test.ts`

- [ ] **Step 1: Failing tests for the new helper**

```ts
import { resolveParamFields } from '../../src/runner/resolveParamFields';
import { emptySpec } from '../../src/schema/defaults';

test('returns [] for undefined target', () => {
  expect(resolveParamFields(undefined, emptySpec())).toEqual([]);
});

test('returns the inline object\'s fields directly', () => {
  const target = { kind: 'object', fields: [
    { name: 'a', required: true, type: { kind: 'string' } },
  ] } as const;
  expect(resolveParamFields(target, emptySpec())).toEqual(target.fields);
});

test('resolves a ref to an object type', () => {
  const spec = {
    ...emptySpec(),
    types: { Filter: { kind: 'object', fields: [
      { name: 'status', required: true, type: { kind: 'string' } },
    ] } },
  };
  expect(resolveParamFields({ kind: 'ref', ref: 'Filter' }, spec))
    .toEqual([{ name: 'status', required: true, type: { kind: 'string' } }]);
});

test('throws when ref target is missing', () => {
  expect(() => resolveParamFields({ kind: 'ref', ref: 'Nope' }, emptySpec()))
    .toThrow(/not in spec.types/);
});

test('throws when ref target is not an object', () => {
  const spec = { ...emptySpec(), types: { S: { kind: 'string' } } };
  expect(() => resolveParamFields({ kind: 'ref', ref: 'S' }, spec))
    .toThrow(/expected object/);
});
```

- [ ] **Step 2: Implement `resolveParamFields.ts`**

```ts
import type { Spec, ObjectType, RefType, ObjectField } from '../schema/types';

export function resolveParamFields(
  target: ObjectType | RefType | undefined,
  spec: Spec,
): ObjectField[] {
  if (!target) return [];
  if (target.kind === 'object') return target.fields;
  if (target.kind === 'ref') {
    const t = spec.types[target.ref];
    if (!t) throw new Error(`resolveParamFields: ref "${target.ref}" not in spec.types`);
    if (t.kind !== 'object') throw new Error(`resolveParamFields: ref "${target.ref}" resolves to ${t.kind}, expected object`);
    return t.fields;
  }
  return [];
}
```

- [ ] **Step 3: Delete `expandParam`**

```bash
git rm packages/core/src/runner/expandParam.ts packages/core/tests/runner/expandParam.test.ts
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Remove `export * from './runner/expandParam';` and add `export * from './runner/resolveParamFields';`.

- [ ] **Step 5: Tests pass for the new helper**

```bash
pnpm --filter @zwaggen/core test -- resolveParamFields
```

(Other tests still broken — fine.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/runner/resolveParamFields.ts packages/core/src/index.ts packages/core/tests/runner/resolveParamFields.test.ts
git commit -m "$(cat <<'EOF'
feat(core): resolveParamFields replaces expandParam

The v7 schema makes query/header params an ObjectType (or ref);
resolveParamFields returns the resolved fields list. expandParam is
gone — the runtime model no longer needs the per-call expansion since
the schema IS the object directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migrate runner + tests for the new shape

**Files:**
- Modify: `packages/core/src/runner/send.ts` — verify it doesn't read `endpoint.queryParams.length` or similar; update if it does.
- Modify: `packages/core/tests/runner/buildRequest.test.ts` — fixtures use new shape OR rely on migration via fromJSON.
- Modify: `packages/core/tests/runner/send.test.ts` — same.
- Modify: `packages/core/tests/runner/send.proxy.test.ts` — same.
- Modify: `packages/core/tests/runner/buildRequest.test.ts` — same.

- [ ] **Step 1: Audit runner**

```bash
grep -n 'endpoint\.queryParams\|endpoint\.headers' packages/core/src/runner/
```

Most likely the runner only reads `req.inputs.query` and `req.inputs.headers` (flat records), not the schema's queryParams/headers. If it reads the schema, switch via `resolveParamFields`.

- [ ] **Step 2: Update tests that build endpoint fixtures by hand**

For each test that constructs an endpoint with `queryParams: [...]`, switch to:

```ts
queryParams: { kind: 'object', fields: [...] }
// or remove entirely if empty
```

Same for `headers`. Use search-and-replace.

- [ ] **Step 3: Tests pass**

```bash
pnpm --filter @zwaggen/core test
```

Now all core tests should be green.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "$(cat <<'EOF'
test(core): update fixtures to v7 query/header ObjectType shape

Tests that build endpoint specs by hand now use the inline ObjectType
shape for query/header params. Tests that load specs via fromJSON
auto-migrate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Codegen — switch to resolveParamFields, drop expandParam imports

**Files:**
- Modify: `packages/cli/src/generate/client.ts`
- Modify: `packages/cli/tests/generate/*` — fixtures + goldens may need updates.

- [ ] **Step 1: Update `client.ts`**

Replace every `expandParam` import + call with `resolveParamFields`:

```ts
import { resolveParamFields } from '@zwaggen/core';

// inputTypeFor:
const queryFields = resolveParamFields(endpoint.queryParams, spec);
if (queryFields.length > 0) {
  const fields = queryFields.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
  parts.push(`{ ${fields} }`);
}
// (same for headers)

// buildUrlExpr / buildFetchOptsExpr:
const expandedQuery = resolveParamFields(endpoint.queryParams, spec);
// (same iteration as before)
```

- [ ] **Step 2: Update fixtures**

`packages/cli/tests/generate/fixtures/codegen-fixture.json` and `codegen-v1.1-fixture.json` — these are JSON specs that load via `fromJSON`. The migration handles them automatically. Verify by running the tests; if any test does direct `JSON.parse` instead of `fromJSON`, switch to `fromJSON`.

- [ ] **Step 3: Tests pass**

```bash
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
```

The generated client output for existing fixtures should be byte-identical (fixtures' query params are flat strings, which migrate to single-field objects, which generate the same TS shape).

- [ ] **Step 4: Commit**

```bash
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli/codegen): use resolveParamFields for v7 query/header object shape

Replaces the expandParam call sites — same generated output for
existing flat-param specs (the v6 → v7 migration produces an
equivalent ObjectType representation).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: OpenAPI exporter + importer

**Files:**
- Modify: `packages/core/src/exporters/openapi.ts`
- Modify: OpenAPI importer (search for it — likely `apps/web/src/importers/openapi.ts`).
- Modify: corresponding tests.

- [ ] **Step 1: Exporter**

Replace `expandParam` calls with `resolveParamFields`:

```ts
import { resolveParamFields } from '../runner/resolveParamFields';

const queryFields = resolveParamFields(endpoint.queryParams, spec);
const headerFields = resolveParamFields(endpoint.headers, spec);
// ... emit each field as a separate parameters entry, same as before ...
```

- [ ] **Step 2: Importer — collect into one object per `in`**

```ts
const queryParams = (op.parameters ?? []).filter((p: any) => p.in === 'query');
const headerParams = (op.parameters ?? []).filter((p: any) => p.in === 'header');

if (queryParams.length > 0) {
  endpoint.queryParams = {
    kind: 'object',
    fields: queryParams.map((p: any) => ({
      name: p.name,
      required: p.required ?? false,
      type: openApiToTypeDef(p.schema),
      ...(p.description ? { description: p.description } : {}),
    })),
  };
}
// same for headers
```

- [ ] **Step 3: Tests pass**

```bash
pnpm --filter @zwaggen/core test
pnpm --filter web test
```

Existing OpenAPI round-trip tests should still pass — the wire shape is unchanged, only the in-memory Zwaggen shape differs.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/exporters/openapi.ts apps/web/src/importers/openapi.ts packages/core/tests/exporters apps/web/tests/importers
git commit -m "$(cat <<'EOF'
feat(core/openapi): emit + collect query/headers as v7 ObjectType

Exporter walks resolveParamFields then emits one OpenAPI parameter
per field. Importer collects all in:query and in:header parameters
for an operation into one inline ObjectType per slot. Wire shape
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: RunPanel + EndpointEditor UI updates

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Modify: `apps/web/src/ui/EndpointEditor.tsx`
- Modify: `apps/web/src/state/store.ts` — if any actions read `endpoint.queryParams.length` etc.
- Modify: `apps/web/tests/ui/*` — RunPanel + EndpointEditor tests.

- [ ] **Step 1: RunPanel — switch to resolveParamFields**

```tsx
import { resolveParamFields } from '@zwaggen/core';

const queryFields = useMemo(
  () => resolveParamFields(endpoint.queryParams, spec),
  [endpoint.queryParams, spec],
);
const headerFields = useMemo(
  () => resolveParamFields(endpoint.headers, spec),
  [endpoint.headers, spec],
);

// Existing pre-population logic — read from the resolved object's example.
// Update the example-seeding effect to use queryFields-derived seed.

{queryFields.length > 0 && (
  <ParamInputs label={t('query')} params={queryFields} values={queryVals} onChange={setQueryVals} />
)}
{headerFields.length > 0 && (
  <ParamInputs label={t('headers')} params={headerFields} values={headerVals} onChange={setHeaderVals} />
)}
```

- [ ] **Step 2: EndpointEditor — inline / ref / none toggle**

In `apps/web/src/ui/EndpointEditor.tsx`, find the existing query and header `ParamTable` blocks. Wrap each with the inline/ref selector pattern from the spec:

```tsx
function QueryHeaderSection({ label, value, onChange, spec }: {
  label: string;
  value: ObjectType | RefType | undefined;
  onChange: (next: ObjectType | RefType | undefined) => void;
  spec: Spec;
}) {
  const namedObjectTypes = Object.entries(spec.types)
    .filter(([_, t]) => t.kind === 'object')
    .map(([n]) => n);
  const mode = !value ? 'none' : value.kind === 'ref' ? 'ref' : 'inline';
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="panel-title">{label}</h3>
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as 'none' | 'inline' | 'ref';
            if (next === 'none') onChange(undefined);
            else if (next === 'inline') {
              const seedFields = value?.kind === 'ref'
                ? (spec.types[value.ref] as ObjectType | undefined)?.fields ?? []
                : [];
              onChange({ kind: 'object', fields: seedFields });
            } else {
              const first = namedObjectTypes[0];
              if (first) onChange({ kind: 'ref', ref: first });
            }
          }}
          className="input text-xs"
        >
          <option value="none">None</option>
          <option value="inline">Inline fields</option>
          <option value="ref" disabled={namedObjectTypes.length === 0}>Use shared type</option>
        </select>
      </div>
      {mode === 'inline' && value?.kind === 'object' && (
        <ParamTable
          title=""
          value={value.fields}
          onChange={(fields) => onChange({ kind: 'object', fields })}
          typeNames={Object.keys(spec.types)}
        />
      )}
      {mode === 'ref' && value?.kind === 'ref' && (
        <select
          value={value.ref}
          onChange={(e) => onChange({ kind: 'ref', ref: e.target.value })}
          className="input"
        >
          {namedObjectTypes.map((n) => <option key={n}>{n}</option>)}
        </select>
      )}
    </section>
  );
}

// In EndpointEditor's render:
<QueryHeaderSection
  label={t('queryParams')}
  value={ep.queryParams}
  onChange={(v) => patch({ queryParams: v })}
  spec={spec}
/>
<QueryHeaderSection
  label={t('headers')}
  value={ep.headers}
  onChange={(v) => patch({ headers: v })}
  spec={spec}
/>
```

(Adapt to the existing component patterns and styling.)

- [ ] **Step 3: Test updates**

For tests that build endpoints by hand with `queryParams: [...]`, switch to the new shape. RunPanel tests for object-typed query params (already in the codebase from the previous slice) should keep passing — the user-visible behavior is unchanged.

Add a test for the EndpointEditor inline/ref/none toggle.

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): EndpointEditor inline/ref/none toggle for v7 query/header objects

Query and Header sections in EndpointEditor now toggle between None,
Inline fields (existing ParamTable editor on the inline ObjectType's
fields), and Use shared type (pick a named object type from spec.types).
RunPanel reads via resolveParamFields. User-visible runtime behavior
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Documentation + TODO + final sweep

**Files:**
- Modify: `apps/docs/guide/endpoints.md` (en + zh-TW)
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Update endpoints guide**

Find the Query / header / cookie params section. Rewrite to describe v7:

en:
```markdown
**Query and header params are an object.** Each endpoint's `queryParams` and `headers` is either an inline object (define fields directly in the editor) or a `ref` to a named object type (so multiple endpoints can share, e.g., `PaginationQuery = { page; limit }`). Each field becomes a query string key (`?page=1&limit=20`), matching OpenAPI 3's default `style=form, explode=true`.
```

Same shape in zh-TW.

- [ ] **Step 2: Final sweep**

```bash
pnpm install
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/core lint
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter @zwaggen/desktop test
pnpm --filter docs build
```

All green.

- [ ] **Step 3: Update TODO**

Add a ticked entry:

```
- [x] Query and header params as ObjectType (schema v7) — collapses the dual-tier model; `endpoint.queryParams: ObjectType | RefType | undefined` (same for headers); `expandParam` deleted; new `resolveParamFields` helper. EndpointEditor toggles inline / ref / none. See `docs/plans/done/2026-04-23-params-as-object.md`.
```

Add a follow-up:

```
- [ ] Body form params as ObjectType (v8?) — extend the v7 collapse to `endpoint.bodyForm`. FileType placement validator becomes "valid only inside the multipart body's object" — manageable but distinct enough to defer.
```

Update "Last updated" stamp.

- [ ] **Step 4: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-23-params-as-object.md docs/specs/done/
git mv docs/plans/active/2026-04-23-params-as-object.md docs/plans/done/
```

- [ ] **Step 5: Commit**

```bash
git add docs apps/docs
git commit -m "$(cat <<'EOF'
docs: ship params-as-object (v7) — guide update + TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 7 tasks ticked.
- Schema at v7; v6 → v7 migration ships and is tested.
- `expandParam` deleted; `resolveParamFields` shipped.
- Every call site (RunPanel, codegen, OpenAPI exporter + importer) uses the new helper.
- EndpointEditor surfaces inline / ref / none.
- Existing fixtures auto-migrate via `fromJSON`; no goldens break.
- All test suites green.
- Docs updated (both locales).
- Branch `plan/params-as-object` ready to push.
