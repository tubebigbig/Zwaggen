# Spec — Query and header params as ObjectType (schema v7)

## Problem

After the just-shipped `expandParam` work, the schema has a confusing two-tier model for query and header params:

- **Tier 1 (flat ParamDef):** `{ name: 'page', type: { kind: 'integer' } }` — the ParamDef's `name` becomes the URL key.
- **Tier 2 (object-typed ParamDef):** `{ name: 'filter', type: { kind: 'ref', ref: 'Filter' } }` — the ParamDef's `name` becomes a developer-facing label and is *ignored* in the URL; Filter's fields become the URL keys.

The bridging logic (`expandParam`) only exists because of this dual model. It's pointless ceremony — collapsing to ONE tier eliminates the special-casing entirely.

The cleaner shape: query params (and headers) **ARE** an object. Its fields ARE the URL keys. That's what HTTP query strings literally are: a flat key/value map. ParamDef.name disappears; ObjectField.name takes over.

A bonus from this collapse: refs become natural. `endpoint.queryParams: ref('PaginationQuery')` lets every paginated endpoint share `{ page; limit; sort }` from a named type. Today you'd have to either (a) repeat the three ParamDefs at every endpoint, or (b) rely on the fragile expansion. With v7 it's a single ref.

This is the architectural cleanup the user proposed after seeing the just-merged expansion code.

## Success criteria

- **Schema bumps v6 → v7** with a real (non-stamp) migration.
- **`Endpoint`** shape change:
  ```ts
  // BEFORE (v6)
  queryParams: ParamDef[]
  headers: ParamDef[]

  // AFTER (v7)
  queryParams?: ObjectType | RefType
  headers?: ObjectType | RefType
  ```
  - `pathParams: ParamDef[]` stays (positional, tied to URL `{name}` placeholders).
  - `bodyForm?: ParamDef[]` stays for now (its fields can include FileType which has special handling — out of scope for this slice; see "Out of scope").
- **Migration v6 → v7** wraps each endpoint's `queryParams` / `headers` arrays into an inline `ObjectType`:
  - Empty array → omit the field (undefined).
  - Non-empty array → `{ kind: 'object', fields: paramDefs.map(p => ({ name: p.name, required: p.required, type: p.type, description: p.description })) }`.
  - Lossless because `ParamDef` and `ObjectField` are structurally identical (same `{ name; required; type; description? }`).
- **`expandParam` DELETED** from `@zwaggen/core` (and its re-export in `index.ts`). The runtime model no longer needs it.
- **New helper `resolveParamFields(target: ObjectType | RefType | undefined, spec: Spec): ObjectField[]`** in `@zwaggen/core` returns the resolved fields list. Returns `[]` for undefined; resolves refs via `spec.types`. Throws if the ref doesn't exist or doesn't resolve to an ObjectType (since the schema validator should guarantee this; the throw is a defensive guard).
- **Runner** (`packages/core/src/runner/send.ts`):
  - `buildRequest` reads `inputs.query` / `inputs.headers` flat as today (no change).
  - The runner doesn't *use* the schema's queryParams/headers fields at all today — it only consumes `inputs.*`. So the runner code is essentially unchanged; just the type annotations adjust.
- **EndpointEditor** UI:
  - Query and Header sections each get a small "Source" toggle: **Inline / Use shared type**.
  - Inline mode: existing `ParamTable`-style editor edits the inline ObjectType's `fields`. Functionally identical to today's UI, just sourced from `endpoint.queryParams.fields` rather than `endpoint.queryParams`.
  - Ref mode: dropdown lists named object types from `spec.types` (filtered to `kind: 'object'`). Selecting one sets `endpoint.queryParams = { kind: 'ref', ref: <name> }`.
  - Switching from ref → inline pre-fills the inline object with a copy of the ref'd type's fields (so the user doesn't lose work).
- **RunPanel** UI:
  - Same row-per-field rendering as today's expanded version, but reads from `resolveParamFields(endpoint.queryParams, spec)` (and same for headers) instead of `endpoint.queryParams.flatMap(expandParam)`.
  - Pre-population from `example` continues to work (sourced from the resolved object's `example` field).
- **Codegen** (`packages/cli/src/generate/client.ts`):
  - `inputTypeFor` reads via `resolveParamFields` for query/headers. Generated input shape unchanged for users.
  - `buildUrlExpr` / `buildFetchOptsExpr` walk the resolved fields. Same.
- **OpenAPI exporter**:
  - Walks `resolveParamFields` for each endpoint's query/headers.
  - Emits each field as a separate `parameters` entry (default `style=form, explode=true` for query; explicit `explode: true` for headers).
- **OpenAPI importer**:
  - Collects all `in: 'query'` parameters for an operation into one inline `{ kind: 'object', fields: [...] }` for `endpoint.queryParams`.
  - Same for `in: 'header'`.
  - Lossless from the wire — round-trip works.
- **Tests**:
  - Migration test: v6 spec with ParamDef[] migrates cleanly; empty arrays become undefined.
  - `resolveParamFields` unit tests (resolve ref, resolve inline, undefined → []).
  - Runner buildRequest still works for query/header inputs (no behavior change).
  - RunPanel renders rows from object fields.
  - EndpointEditor switching inline ↔ ref works.
  - Codegen test for query/headers — generated input type matches.
  - OpenAPI export + import round-trip for each shape.
  - The `expandParam.test.ts` file is REMOVED (the helper is gone).
- TODO entry "Per-param style override" (logged from the previous slice) stays — still relevant for the deepObject / JSON-encoded variants.
- Add a new TODO entry: "Body form params as ObjectType (v8)?" — defer for now since file types complicate it.

## Out of scope

- **`bodyForm: ParamDef[]` migration to ObjectType.** Body forms include `FileType` which is restricted to multipart bodyForm only. Migrating bodyForm to ObjectType is structurally fine but the FileType placement validator becomes "this field type is only valid inside an object that's the multipart body" — an awkward dependency. Defer to a future v8 if there's appetite.
- **`pathParams` migration.** Path params are positional and tied to URL templates; keeping ParamDef[] is correct.
- **Per-param `style` override** (`deepObject`, JSON-encoded) — still v2 follow-up from the previous slice.
- **Validation that the resolved type is an ObjectType.** A lightweight type guard in `resolveParamFields` is enough; a full top-level validator pass is its own follow-up.
- **Removing the OpenAPI importer's per-param-entry-as-flat behavior** beyond the new "collect into one object" path. v7 import always returns one inline ObjectType per endpoint per `in`.
- **Editing UI for nested object fields**: the existing TypeBuilder/ParamTable handles flat objects; we don't change that.
- **Documentation overhaul of guide pages** — minor edits to mention the new schema shape are in scope; no major rewrites.

## Approach

### Schema (v7)

`packages/core/src/schema/types.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 7 as const;

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];                          // unchanged
  queryParams?: ObjectType | RefType;              // CHANGED — was ParamDef[]
  headers?: ObjectType | RefType;                  // CHANGED — was ParamDef[]
  requestBody: TypeDef | null;
  bodyContentType?: BodyContentType;
  bodyForm?: ParamDef[];                           // unchanged in v7
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

Snapshot v6 in `packages/core/src/schema/versions/v6.ts` (mirror of current Endpoint with `queryParams: ParamDef[]` and `headers: ParamDef[]`).

### Migration v6 → v7

```ts
{
  from: 6,
  to: 7,
  migrate: (v6: SpecV6): Spec => ({
    ...v6,
    schemaVersion: 7,
    endpoints: v6.endpoints.map((ep) => {
      const { queryParams, headers, ...rest } = ep;
      const next: Endpoint = { ...rest, pathParams: ep.pathParams, requestBody: ep.requestBody, responses: ep.responses, auth: ep.auth, useProxy: ep.useProxy };
      if (queryParams && queryParams.length > 0) {
        next.queryParams = { kind: 'object', fields: queryParams.map((p) => ({
          name: p.name, required: p.required, type: p.type,
          ...(p.description !== undefined ? { description: p.description } : {}),
        })) };
      }
      if (headers && headers.length > 0) {
        next.headers = { kind: 'object', fields: headers.map((p) => ({
          name: p.name, required: p.required, type: p.type,
          ...(p.description !== undefined ? { description: p.description } : {}),
        })) };
      }
      return next;
    }),
  }),
}
```

### `resolveParamFields` helper

Replaces `expandParam`. New file `packages/core/src/runner/resolveParamFields.ts`:

```ts
import type { Spec, ObjectType, RefType, ObjectField } from '../schema/types';

/**
 * Resolve an endpoint's query/headers slot to a concrete fields list.
 * Returns [] for undefined; resolves a RefType via `spec.types`.
 * Throws if a ref points at a missing or non-object type — the editor +
 * validator should prevent this; the throw is a defensive guard.
 */
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
  // Should be unreachable given the type narrowing.
  return [];
}
```

Re-export from `packages/core/src/index.ts`. Drop the `expandParam` export.

### Runner

`packages/core/src/runner/send.ts`:

The runner doesn't iterate `endpoint.queryParams` / `endpoint.headers` today — it only iterates `inputs.query` / `inputs.headers`. So the only change is type annotations (no longer typed as `ParamDef[]` in the surrounding code that touches Endpoint). Verify nothing reads `endpoint.queryParams.length` or similar; if it does, switch to `resolveParamFields(endpoint.queryParams, spec).length`.

### Delete `expandParam`

```bash
git rm packages/core/src/runner/expandParam.ts
git rm packages/core/tests/runner/expandParam.test.ts
```

Remove the export from `packages/core/src/index.ts`. Audit all imports — three call sites (RunPanel, codegen client.ts, openapi.ts exporter). Each switches to `resolveParamFields`.

### EndpointEditor

`apps/web/src/ui/EndpointEditor.tsx` — query and header sections become:

```tsx
function QueryHeaderSection({ label, value, onChange, namedObjectTypes, spec }: {
  label: string;
  value: ObjectType | RefType | undefined;
  onChange: (next: ObjectType | RefType | undefined) => void;
  namedObjectTypes: string[];   // names of types in spec.types where kind === 'object'
  spec: Spec;
}) {
  const mode = !value ? 'none' : value.kind === 'ref' ? 'ref' : 'inline';
  return (
    <section>
      <h3>{label}</h3>
      <select
        value={mode}
        onChange={(e) => {
          const next = e.target.value as 'none' | 'inline' | 'ref';
          if (next === 'none') onChange(undefined);
          else if (next === 'inline') {
            // If switching from ref, copy fields out for non-destructive transition.
            const seedFields = value?.kind === 'ref' ? (spec.types[value.ref] as ObjectType)?.fields ?? [] : [];
            onChange({ kind: 'object', fields: seedFields });
          } else {
            // ref mode — pick the first available named type
            const first = namedObjectTypes[0];
            if (first) onChange({ kind: 'ref', ref: first });
          }
        }}
      >
        <option value="none">None</option>
        <option value="inline">Inline fields</option>
        <option value="ref" disabled={namedObjectTypes.length === 0}>Use shared type</option>
      </select>
      {mode === 'inline' && value?.kind === 'object' && (
        <ParamTable
          title=""
          value={value.fields}
          onChange={(fields) => onChange({ kind: 'object', fields })}
          typeNames={Object.keys(spec.types)}
        />
      )}
      {mode === 'ref' && value?.kind === 'ref' && (
        <select value={value.ref} onChange={(e) => onChange({ kind: 'ref', ref: e.target.value })}>
          {namedObjectTypes.map((n) => <option key={n}>{n}</option>)}
        </select>
      )}
    </section>
  );
}
```

(`ParamTable.value` accepts `ObjectField[]`; since `ObjectField` is structurally identical to `ParamDef`, no API change needed there.)

Wire two of these into EndpointEditor — one for query, one for headers.

### RunPanel

```tsx
const queryFields = useMemo(
  () => resolveParamFields(endpoint.queryParams, spec),
  [endpoint.queryParams, spec],
);
const headerFields = useMemo(
  () => resolveParamFields(endpoint.headers, spec),
  [endpoint.headers, spec],
);

// Pre-populate from example as before, but pull from the OBJECT'S example
// (or the field-level examples once we have them).
useEffect(() => {
  // ... existing reset / seed logic, sourced from the resolved object's example ...
}, [endpoint.id]);

// Render
<ParamInputs label={t('query')} params={queryFields} values={queryVals} onChange={setQueryVals} />
<ParamInputs label={t('headers')} params={headerFields} values={headerVals} onChange={setHeaderVals} />
```

### Codegen

```ts
import { resolveParamFields } from '@zwaggen/core';

function inputTypeFor(endpoint: Endpoint, spec: Spec): string {
  const parts: string[] = [];
  if (endpoint.pathParams.length > 0) {
    const fields = endpoint.pathParams.map((p) => `${safeIdentifier(p.name)}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ ${fields} }`);
  }
  const queryFields = resolveParamFields(endpoint.queryParams, spec);
  if (queryFields.length > 0) {
    const fields = queryFields.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ ${fields} }`);
  }
  const headerFields = resolveParamFields(endpoint.headers, spec);
  if (headerFields.length > 0) {
    const fields = headerFields.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ ${fields} }`);
  }
  // body unchanged
}
```

`buildUrlExpr` and `buildFetchOptsExpr` — same swap from `endpoint.queryParams.flatMap(expandParam)` → `resolveParamFields(endpoint.queryParams, spec)`.

### OpenAPI exporter

```ts
import { resolveParamFields } from '../runner/resolveParamFields';

const queryFields = resolveParamFields(endpoint.queryParams, spec);
const headerFields = resolveParamFields(endpoint.headers, spec);
// ... emit each field as a separate parameter entry ...
```

(Drop the `endpoint.queryParams.flatMap(expandParam)` calls.)

### OpenAPI importer

```ts
const queryParams = openApiOp.parameters?.filter((p: any) => p.in === 'query') ?? [];
const headerParams = openApiOp.parameters?.filter((p: any) => p.in === 'header') ?? [];

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

### Tests

- `packages/core/tests/schema/migrations.test.ts` — v6 → v7 case (verify ParamDef[] becomes ObjectType.fields, empty arrays become undefined).
- `packages/core/tests/runner/resolveParamFields.test.ts` — new (3 cases: undefined, inline object, ref to object).
- `packages/core/tests/runner/expandParam.test.ts` — DELETED.
- `packages/core/tests/exporters/openapi.test.ts` — existing ones likely keep working; verify the round-trip importer→exporter still produces the same wire shape.
- `apps/web/tests/ui/EndpointEditor.bodyType.test.tsx` (or new `.queryHeaders.test.tsx`) — switching inline ↔ ref ↔ none works.
- `apps/web/tests/ui/RunPanel.objectQuery.test.tsx` — likely keeps passing as-is since the user-visible behavior is unchanged.
- `packages/cli/tests/generate/client.test.ts` — query/header tests likely keep passing; goldens may shift if the codegen-fixture.json has any query params (which it does; needs migration via fromJSON before the codegen reads it).

### Existing fixtures

`packages/cli/tests/generate/fixtures/codegen-fixture.json` and `codegen-v1.1-fixture.json` contain v4 / v5 / v6 specs with `queryParams: ParamDef[]`. The migration framework (`fromJSON`) will auto-migrate them to v7 on read. So fixtures stay as-is; the codegen tests load via `fromJSON` which migrates implicitly.

(Confirm the test files use `fromJSON` and not direct `JSON.parse` — adjust if they go around the migration.)

### Documentation

Update `apps/docs/guide/endpoints.md` (en + zh-TW). Replace the "Query / header / cookie params" paragraphs to describe the new model:

> **Query and header params are an object.** Define the fields in the editor (or pick a shared object type via "Use shared type"). Each field becomes a query string key (`?status=active&category=widgets`) — the same form/explode semantics OpenAPI uses by default.

Same in zh-TW.

### Risks

- **Existing user specs** load via `fromJSON` which migrates v6 → v7 transparently. New saves write v7. If a user shares a spec with someone on a v6 client, that client will fail to load (or migrate forward — depends on the chain).
- **EndpointEditor UI churn**: switching inline ↔ ref needs careful UX. If users select "ref" and there are no object types yet, the option should be disabled with a tooltip ("Define an object type in the Types panel first").
- **OpenAPI importer**: any existing tests/fixtures expecting `endpoint.queryParams` to be an array WILL fail. Search for `queryParams.length`, `queryParams.map(`, `queryParams.find(` etc. and update.
- **Bundle size**: `resolveParamFields` is ~15 lines; `expandParam` was similar. Net neutral.
- **Test fixture migration**: codegen + openapi tests that build specs by hand (not via `fromJSON`) need updating to use the v7 shape directly.

## Done definition

- Schema at v7; v6 → v7 migration ships and is tested.
- `endpoint.queryParams` and `endpoint.headers` are `ObjectType | RefType | undefined`.
- `resolveParamFields` shipped; `expandParam` deleted.
- All call sites (RunPanel, codegen, OpenAPI exporter, OpenAPI importer) updated.
- EndpointEditor surfaces the inline/ref/none toggle.
- Migration auto-translates existing v6 specs (verified by running existing test fixtures through `fromJSON`).
- All cross-package tests green.
- Documentation paragraph updated (en + zh-TW).
- TODO entries ticked, follow-up "Body form as ObjectType (v8?)" added.
- Spec + plan moved to `done/`.
- Branch `plan/params-as-object` pushed.
