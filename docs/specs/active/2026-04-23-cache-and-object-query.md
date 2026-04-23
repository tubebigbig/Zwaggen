# Spec — Cache header fix + object-typed query/header param expansion

## Problem

Two unrelated production issues bundled into one slice (both small, both quality-of-life).

### 1. play.zwaggen.com stale-HTML-after-deploy

`apps/web/public/_headers` sets `Cache-Control: public, max-age=300, must-revalidate` on HTML. `must-revalidate` only triggers AFTER `max-age` expires — so for the first 5 minutes after a deploy, the browser serves stale HTML *without* asking the server. The stale HTML references hashed asset filenames that Cloudflare has already purged, so the page renders blank until the cache window expires.

### 2. Object-typed query/header params produce broken URLs

When a query (or header) ParamDef's `type` is an object — either via `kind: 'ref'` to a named object, or an inline `kind: 'object'` — the Run panel renders a single text input with the ParamDef's `name` as the key. That gets serialized as `?<paramName>=<whatever-the-user-typed>`. There's no sane way to express the object's fields.

OpenAPI 3 defaults handle this with `style=form, explode=true`: the OBJECT'S FIELDS become separate query keys; the ParamDef's `name` is just a developer-facing label. So `{ name: 'filter', type: ref('Filter') }` where `Filter = { status: string; category: string }` should serialize as `?status=active&category=widgets`, and the Run panel should show two rows (`status`, `category`) pre-filled from the type's example.

## Success criteria

### Cache fix

- `apps/web/public/_headers` HTML rule changes from `max-age=300, must-revalidate` to `no-cache, must-revalidate` (or equivalent `max-age=0, must-revalidate`).
- Hashed assets keep their year-long immutable cache (no change).
- Document the rationale inline in the `_headers` file so a future reader doesn't "optimize" it back.

### Object-typed query/header expansion

- A new helper `expandParam(param, spec)` (in `@zwaggen/core`) takes a `ParamDef` and either:
  - Returns the param unchanged (non-object type) — current behaviour.
  - Returns an array of "synthetic" ParamDef-like entries (one per field of the resolved object), with the field name as the key, the field type as the type, the field `required` as required, and `description` carried through.
- The same helper handles `kind: 'ref'` (resolves to the named object via `spec.types`), `kind: 'object'` (inline), and `kind: 'array'` (treats array of object as the same expansion — the runner emits each field with the value joined by comma OR repeated; pick repeated for OpenAPI parity, see "Approach"). For other kinds (string/number/bool/literal), it's a passthrough.
- **Run panel**: query and header sections render rows-per-field for object-typed params, pre-populated from the type's `example` if present. The ParamDef's `name` is shown as a small group label above its expanded rows (or omitted entirely if it adds no information). Field-level `required` flag drives the asterisk + validation.
- **Runner**: no change — it already iterates `inputs.query` flat. The expansion happens in the UI (RunPanel writes one entry per expanded field into `inputs.query`/`inputs.headers`).
- **Codegen client**: `inputTypeFor` widens to flatten object-typed query/header params into the merged shape. So `{ name: 'filter', type: ref('Filter') }` no longer emits `query: { filter: Filter }` — it emits `query: { status: string; category?: string }` (the merged fields). For mixed query params (one flat string + one ref'd object), the input type is the union of both flat fields.
- **OpenAPI exporter / importer**: each object-typed query/header param exports as N OpenAPI param entries with `style: 'form'` and `explode: true` (or just N entries with no style — OpenAPI defaults already match). Importer reverses: a group of params with matching `style/explode` gets reassembled into a single Zwaggen ParamDef with an inline object type.
   - **Importer simplification for v1**: don't reassemble. Each expanded param imports as its own flat ParamDef (since the importer can't know they originated from one object). Round-trip is approximate but lossless at the wire-shape level.
- **Tests**:
  - `expandParam` unit tests for ref / inline-object / passthrough / nested-object-rejection.
  - Runner build tests: query with an object-typed expansion produces the right `?key=value&key=value` URL.
  - RunPanel test: render an endpoint with a ref'd-object query param + assert two rows render with the field names + assert `inputs.query` on Run is the flat record.
  - Codegen test: client method `query` input is the flattened shape.
  - OpenAPI export test: exports as separate `in: 'query'` entries (OpenAPI default style).
- **No schema bump**. Existing TypeDef union covers everything. Pure UI + codegen + exporter behavior change.
- TODO entries ticked: cache fix + new "object-typed query param expansion" entry.

## Out of scope

- **`style: 'deepObject'`** (`?filter[status]=active`) — Stripe / JSON:API style. Useful for some APIs but not the OpenAPI default; would require a per-param `style` field. Defer.
- **Nested-of-nested expansion**: if Filter has a field that's itself an object ref, we DO NOT recurse — that field becomes a single key with a string-coerced value (or a warning). One level of expansion only in v1.
- **Path params with object types**: still rejected. Path is positional; an object doesn't fit. UI should grey-out the field name input and show a tooltip if anyone tries.
- **Repeated query keys for arrays** (`?tags=a&tags=b`): adjacent feature, defer. v1 stringifies array values into one key (or warns).
- **Per-ParamDef serialization style override** (`style: 'form-explode' | 'deepObject' | 'json'`). v1 picks form-explode for everyone.
- **Importer reassembly** of expanded params back into a single object ParamDef. v1 imports each as its own flat ParamDef.
- **Validator rejection** for object-typed path params (it's already implicitly broken; explicit rejection is a follow-up).
- **Body content** — already works (JSON body uses the ref directly; urlencoded/multipart use bodyForm).
- **Documentation update for the new query semantics** — append a paragraph in `apps/docs/guide/endpoints.md` and `running-requests.md`. Both locales.

## Approach

### Cache fix

`apps/web/public/_headers`:

```
# Hashed assets — serve forever (browser + CF edge)
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# HTML and everything else — always revalidate, but cache the bytes
# (after revalidation the server returns 304 if unchanged → fast). This
# prevents post-deploy "blank page" where stale HTML refers to assets
# CF has already purged. Edge cache stays a day; CF Pages auto-purges
# the edge on every new deployment.
/*
  Cache-Control: public, no-cache, must-revalidate
  CDN-Cache-Control: public, max-age=86400
  X-Content-Type-Options: nosniff
  ...
```

`no-cache` does NOT mean "don't cache"; it means "always revalidate before use." Browser stores the response, sends `If-None-Match`/`If-Modified-Since` on every load, and gets a 304 (~200 bytes) when content unchanged. Effectively the same speed as `max-age=300` for unchanged content; the extra latency is one round-trip to CF edge per page load.

### `expandParam` helper

Lives at `packages/core/src/runner/expandParam.ts`:

```ts
import type { Spec, ParamDef, ObjectType } from '../schema/types';
import { resolveObject } from '../schema/resolveObject';

/**
 * Expand an object-typed ParamDef into one synthetic ParamDef per field
 * (form/explode semantics — matches OpenAPI 3 default for object-typed
 * query and header params). Refs are dereferenced via `spec.types`.
 *
 * Non-object params pass through unchanged (returns a 1-element array).
 *
 * Only one level of expansion: nested object fields stay as-is and the
 * UI/runner stringifies their values.
 */
export function expandParam(param: ParamDef, spec: Spec): ParamDef[] {
  const obj = resolveToObject(param.type, spec);
  if (!obj) return [param];
  return obj.fields.map((f) => ({
    name: f.name,
    required: f.required && param.required, // both must be required
    type: f.type,
    description: f.description,
  }));
}

function resolveToObject(type: TypeDef, spec: Spec): ObjectType | null {
  if (type.kind === 'object') return type;
  if (type.kind === 'ref') {
    const target = spec.types[type.ref];
    if (target?.kind === 'object') return target;
  }
  return null;
}
```

(For an inline object the `description` from the ParamDef is dropped; field-level descriptions take over. For ref'd objects the type's description survives via the field metadata.)

### RunPanel changes

`ParamInputs` accepts `params` and `values` directly today. Wrap the call sites:

```tsx
const expandedQuery = useMemo(
  () => endpoint.queryParams.flatMap((p) => expandParam(p, spec)),
  [endpoint.queryParams, spec],
);
const expandedHeaders = useMemo(
  () => endpoint.headers.flatMap((p) => expandParam(p, spec)),
  [endpoint.headers, spec],
);

// ...
<ParamInputs label={t('query')} params={expandedQuery} values={queryVals} onChange={setQueryVals} />
<ParamInputs label={t('headers')} params={expandedHeaders} values={headerVals} onChange={setHeaderVals} />
```

`inputs.query` and `inputs.headers` become flat records keyed by the expanded field names, exactly as today.

### Pre-populating from `example`

If a query param's resolved type is `{ kind: 'object', example: { status: 'active', category: 'widgets' }, fields: [...] }`, the RunPanel pre-populates `queryVals.status = 'active'` and `queryVals.category = 'widgets'` on first mount of the endpoint.

Use the existing `resolveExample` helper (in `@zwaggen/core/schema/resolveExample`) to compute the example values per field. Apply only on endpoint change (not on every render).

### Runner change

None. `buildRequest` already iterates `req.inputs.query` and produces `?k=v` for each. Field-name keys go in directly.

Wait — but the existing `for (const [k, v] of Object.entries(req.inputs.query))` loop uses the literal string. So if RunPanel writes `{ status: 'active', category: 'widgets' }` to `inputs.query`, the URL becomes `?status=active&category=widgets`. That's correct.

### Codegen change

`packages/cli/src/generate/client.ts` `inputTypeFor` widens for query and headers:

```ts
function inputTypeFor(endpoint: Endpoint, spec: Spec): string {
  const parts: string[] = [];
  // path stays as-is
  if (endpoint.queryParams.length > 0) {
    const expanded = endpoint.queryParams.flatMap((p) => expandParam(p, spec));
    const fields = expanded.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ ${fields} }`);
  }
  if (endpoint.headers.length > 0) {
    const expanded = endpoint.headers.flatMap((p) => expandParam(p, spec));
    const fields = expanded.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ ${fields} }`);
  }
  // body unchanged
}
```

The generated method body's URL-construction loop already uses `input[<name>]` keyed by the expanded field names — no change there since the same expansion logic feeds it.

### OpenAPI exporter

For each query/header ParamDef, expand via `expandParam(p, spec)` and emit each result as a separate OpenAPI param entry with `in: 'query'` (or `'header'`) and the field's type as `schema`. OpenAPI's default `style` is `form` with `explode: true` for query, so omit `style`/`explode` (defaults match what we want). For header, default style is `simple` with `explode: false` — set `explode: true` explicitly to match the form/explode semantics.

### Importer

When reading OpenAPI params: each `in: 'query'` / `in: 'header'` param becomes one Zwaggen ParamDef. NO reassembly into object-typed parents in v1 (would require deduplication heuristics; defer).

### Documentation

In `apps/docs/guide/endpoints.md` (en + zh-TW), append a paragraph to the "Query / header / cookie params" section:

> **Object-typed query and header params expand into per-field rows.** When a param's type is a `ref` to an object (or an inline object), the runner serializes each field of the object as its own query key (`?status=active&category=widgets`), matching OpenAPI 3's default `style=form, explode=true`. The ParamDef's `name` becomes a developer-facing label only — it doesn't appear in the URL. Use a flat `string` / `number` / `boolean` type if you need the param name to be the actual key.

Same idea in zh-TW.

### Tests

Per the success criteria. Distributed across:
- `packages/core/tests/runner/expandParam.test.ts` — new
- `packages/core/tests/runner/buildRequest.test.ts` — extended (object-typed query → multi-key URL)
- `apps/web/tests/ui/RunPanel.objectQuery.test.tsx` — new
- `packages/cli/tests/generate/client.test.ts` — extended (object query in generated input type)
- `packages/core/tests/exporters/openapi.test.ts` — extended (round-trip approximation)

### Risks

- **Existing specs that DELIBERATELY use a single-key object query param** (some legacy APIs `?filter={"status":"active"}`) lose the old behavior. Acceptable v1 trade-off; the per-param `style` override would let them opt out (deferred).
- **Field-name collisions across expanded params**: if two query params expand to fields with the same name, the latter overwrites the former. The expansion helper should warn (console.warn in dev, since this is rare and the user can rename their fields).
- **`example` interpretation for nested objects**: if a field's `example` is itself an object, the pre-population gets messy. Just stringify nested values via `JSON.stringify` for display; user can edit.
- **Codegen test golden updates**: any existing fixture with a query/header that's an object will get a different generated input shape. Inspect diff carefully.
- **Importer round-trip lossiness**: confirmed unavoidable in v1 without per-param style. Document as expected.
- **Validation `requiredHeaders` assertion** in endpoint assertions might compare on the original ParamDef name — verify that's not affected.

## Done definition

- `_headers` HTML rule switched to `no-cache, must-revalidate` with rationale comment.
- `expandParam` helper shipped in `@zwaggen/core` with tests.
- RunPanel renders object-typed query/header params as per-field rows.
- Codegen client input type reflects the expanded shape.
- OpenAPI export emits expanded params with default form/explode semantics.
- Documentation updated (both locales).
- All cross-package tests green.
- TODO entries ticked, follow-up "Per-param style override (deepObject, json)" added.
- Spec + plan moved to `done/`.
- Branch `plan/cache-and-object-query` pushed.
