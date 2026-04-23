# Spec — Body UX overhaul (raw JSON / urlencoded / multipart)

## Problem

Today every endpoint that has a request body is sent as `application/json`. The body input in the Run panel is a plain JSON textarea with zero schema-aware help: type valid JSON or get an error.

Two pain points the user hit while testing the desktop app:

1. **Form-encoded bodies aren't expressible.** OAuth token endpoints, classic HTML form posts, and many legacy APIs require `application/x-www-form-urlencoded`. There's no way to say "send this body as a form" — the JSON path is the only path.
2. **Multipart bodies aren't expressible.** No way to upload a file or send `multipart/form-data` mixed text/file payloads.

Plus the body editing UX is just a JSON textarea even for cases where Postman/Insomnia would offer key/value rows. This is the "easy testing" gap the user named.

## Success criteria

- A new field `endpoint.bodyContentType?: 'json' | 'urlencoded' | 'multipart'` lives on the Endpoint schema. `undefined` (the default for migrated v4 endpoints) is treated as `'json'` — no behavioural change for existing specs.
- A new field `endpoint.bodyForm?: ParamDef[]` carries the field definitions when `bodyContentType` is `'urlencoded'` or `'multipart'`. (Reuses the existing `ParamDef` shape — `{ name, required, type, description }`.) For `'json'`, `requestBody` (existing) is the source of truth.
- Schema bumped from v4 → v5 with a no-op migration (existing v4 endpoints get `bodyContentType: undefined`, which the runner treats as JSON).
- **Runner change** in `@zwaggen/core/runner/send.ts`:
  - `bodyContentType === 'urlencoded'` → serialize `inputs.body` (a `Record<string, string>`) into `URLSearchParams`. Set `Content-Type: application/x-www-form-urlencoded`.
  - `bodyContentType === 'multipart'` → serialize into `FormData`. **Do NOT set Content-Type manually** — `fetch()` sets it with the boundary parameter. Files are out of scope for this slice (text values only).
  - `bodyContentType === 'json'` (or `undefined`) → existing `JSON.stringify` path, existing automatic `Content-Type: application/json` header.
  - Substitution still applies to all string values regardless of body type.
  - The desktop `Transport` interface stays JSON-only (`bodyText: string`); for multipart, `buildRequest` returns a special marker the renderer-side handler can re-serialize. **Defer cross-process FormData transport to a later slice.** For v1, the desktop `handleHttp` accepts only `bodyText`; `multipart` works in the browser playground but NOT through the Electron IPC bridge yet. Document this clearly.
  - **Update for desktop compatibility** — actually, FormData is structured-cloneable across IPC. Re-test and document; if it works, support multipart end-to-end. If not, defer.
- **EndpointEditor UI**:
  - A new dropdown / radio group above the existing requestBody/TypeBuilder: "Body type: JSON / URL-encoded / Multipart".
  - When JSON: existing TypeBuilder for `requestBody` (no change).
  - When URL-encoded or Multipart: render a `ParamTable` for `bodyForm` (reuse the existing component used for path/query/headers).
  - Switching body type preserves the field names where possible (best-effort migration from `requestBody` → `bodyForm` if both shapes are flat strings).
- **RunPanel UI**:
  - When JSON: existing JSON textarea (no change).
  - When URL-encoded or Multipart: render `ParamInputs` rows (the same component used for query params today) for `bodyForm`.
  - Run button posts the values via the runner's serialization.
- **Codegen** (typed client):
  - For `bodyContentType === 'urlencoded'`: emit `body: new URLSearchParams(input.body as Record<string,string>).toString()` and the right Content-Type header.
  - For `bodyContentType === 'multipart'`: defer to a later codegen slice. For now, codegen errors with a clear message: `"multipart body codegen not yet supported — file an issue or use bodyContentType: 'json' or 'urlencoded'"`.
- **OpenAPI exporter**: translates `bodyContentType` into the right OpenAPI 3 `requestBody.content` key (`application/json` / `application/x-www-form-urlencoded` / `multipart/form-data`). Importer reciprocally maps back.
- New tests covering each body type's serialization (`buildRequest` unit tests), UI wiring (RunPanel renders the right editor), and codegen (urlencoded only).
- All existing tests pass after the migration.
- TODO entry added (and ticked) for this slice.

## Out of scope

- **File upload (`<input type="file">`).** Real `File` / `Blob` field type is genuinely useful but adds: a new `'file'` TypeDef kind, IPC structured-clone handling for File objects, codegen typing, and UI surface. Defer to "Body UX v1.1 — file uploads" follow-up TODO. Multipart in v1 supports text fields only.
- **Custom Content-Type override per request.** Users can already add a `Content-Type` header manually in the Headers section; v1 documents that the runner automatically sets one based on bodyContentType but doesn't fight a manual override (the manual one wins).
- **Raw text body (`text/plain`, `application/xml`, etc.).** Not on the immediate request list; could land alongside file upload later.
- **Multipart codegen.** Generated client emits a clear error for now. Most users testing multipart use the playground/desktop, not the typed client.
- **Response-side multipart parsing.** Runner already parses JSON responses; multipart responses are exotic and not handled.
- **Postman-style binary body / GraphQL body / form-data with arrays-as-multiple-values.** All deferred. v1 keeps it simple: flat key/value rows for both urlencoded and multipart.
- **Per-field schemas with `application/json` content-type** (i.e., a JSON value inside one multipart field). Defer.
- **A schema-version bump beyond v5.** v5 only adds the two optional fields; the migration is a no-op.
- **Streaming bodies / chunked encoding.** Not supported by the existing runner; out of scope.
- **Request-body extension preservation (`x-*`).** Out of scope; covered by separate TODO.

## Approach

### Schema (v5)

`packages/core/src/schema/types.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 5 as const;

export type BodyContentType = 'json' | 'urlencoded' | 'multipart';

export interface Endpoint {
  // ... existing fields ...
  requestBody: TypeDef | null;          // used when bodyContentType === 'json' (or undefined)
  bodyContentType?: BodyContentType;    // undefined ≡ 'json' for back-compat
  bodyForm?: ParamDef[];                // used when urlencoded or multipart
  // ... existing fields ...
}
```

Migration v4 → v5 in `packages/core/src/schema/migrations.ts`:

```ts
{
  from: 4,
  to: 5,
  // v4 → v5: added bodyContentType + bodyForm. Existing endpoints get neither
  // (both fields are optional); runner treats absence as 'json'.
  migrate: (spec: SpecV4): Spec => ({ ...spec, schemaVersion: 5 }) as unknown as Spec,
},
```

Snapshot v4 type in `packages/core/src/schema/versions/v4.ts` (mirror of current Endpoint without bodyContentType / bodyForm — exists purely so the migration's `SpecV4` type alias has a home).

### Runner

`packages/core/src/runner/send.ts`'s `buildRequest`:

```ts
const contentType = req.endpoint.bodyContentType ?? 'json';

let bodyText: string | undefined;
let bodyMultipart: FormData | undefined;
let setHeader = true;

if (contentType === 'json') {
  if (req.endpoint.requestBody && req.inputs.body !== undefined) {
    bodyText = JSON.stringify(substituteInValue(req.inputs.body, sub));
    headers['content-type'] = 'application/json';
  }
} else if (contentType === 'urlencoded') {
  const formInputs = req.inputs.body as Record<string, string> | undefined;
  if (formInputs) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(formInputs)) {
      if (v !== undefined && v !== '') params.set(k, sub(String(v)));
    }
    bodyText = params.toString();
    headers['content-type'] = 'application/x-www-form-urlencoded';
  }
} else if (contentType === 'multipart') {
  const formInputs = req.inputs.body as Record<string, string> | undefined;
  if (formInputs) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(formInputs)) {
      if (v !== undefined && v !== '') fd.append(k, sub(String(v)));
    }
    bodyMultipart = fd;
    // DO NOT set content-type — fetch sets it with the boundary
  }
}
```

`BuiltRequest` shape grows a `bodyMultipart?: FormData` field. `sendRequest` chooses which body to pass to fetch:

```ts
const body = built.bodyMultipart ?? built.bodyText;
const resp = await transport({ ..., bodyText: built.bodyText, bodyMultipart: built.bodyMultipart });
```

The `Transport` interface widens. The default `fetchTransport` passes either through to `fetch()`. The desktop IPC transport: try passing `FormData` over `ipcRenderer.invoke` — Electron supports structured cloning of most objects, but **`FormData` is NOT structured-cloneable**. Workaround: serialize the FormData fields to `[name, value][]` on the renderer side, reconstruct on main. Add to scope if confirmed.

**Decision for v1**: do the renderer-side workaround. The desktop's `sendHttpRequest` IPC payload gains an optional `multipartFields?: [string, string][]` array; the main process reconstructs FormData and calls `fetch()`. Pure text fields only. Document the limitation re: file fields in v1.

### EndpointEditor UI

In `apps/web/src/ui/EndpointEditor.tsx`, replace the existing requestBody-toggle block with:

```tsx
<section>
  <h3>{t('requestBody')}</h3>
  <select
    value={ep.bodyContentType ?? 'json'}
    onChange={(e) => patch({ bodyContentType: e.target.value as BodyContentType })}
  >
    <option value="json">JSON</option>
    <option value="urlencoded">URL-encoded</option>
    <option value="multipart">Multipart (text fields, files coming soon)</option>
  </select>

  {(ep.bodyContentType ?? 'json') === 'json' ? (
    <>
      <label>
        <input
          type="checkbox"
          checked={!!ep.requestBody}
          onChange={(e) => patch({ requestBody: e.target.checked ? { kind: 'object', fields: [] } : null })}
        />
        Has body
      </label>
      {ep.requestBody && <TypeBuilder value={ep.requestBody} onChange={...} />}
    </>
  ) : (
    <ParamTable
      title="Form fields"
      value={ep.bodyForm ?? []}
      onChange={(v) => patch({ bodyForm: v })}
      typeNames={Object.keys(spec.types)}
    />
  )}
</section>
```

(Real markup will match existing styling; this is the shape.)

When the user toggles bodyContentType, **clear the unrelated field** to avoid confusion: `requestBody` set to null when switching away from json, `bodyForm` set to `[]` when switching to json. Don't try to convert between shapes — too lossy.

### RunPanel UI

In `apps/web/src/ui/RunPanel.tsx`:

- Track per-body-type input state (`bodyText` for json, `bodyFormVals: Record<string, string>` for urlencoded/multipart).
- Render based on `endpoint.bodyContentType`:
  - JSON: existing textarea unchanged.
  - URL-encoded / Multipart: `<ParamInputs label="Body fields" params={endpoint.bodyForm ?? []} values={bodyFormVals} onChange={setBodyFormVals} />`.
- On Run, build `inputs.body`:
  - JSON: `body = JSON.parse(bodyText)` (existing).
  - URL-encoded / Multipart: `body = bodyFormVals` (already a `Record<string,string>`).

### Codegen

`packages/cli/src/generate/client.ts`:

For each endpoint, decide how to emit the body:

- `bodyContentType === 'json'` (or undefined): existing `body: JSON.stringify(input.body)`.
- `bodyContentType === 'urlencoded'`:
  ```ts
  body: new URLSearchParams(input.body as Record<string, string>).toString(),
  headers: { ..., 'content-type': 'application/x-www-form-urlencoded' }
  ```
- `bodyContentType === 'multipart'`: emit a comment + throw at runtime:
  ```ts
  throw new Error('multipart bodies are not yet supported in the typed client. Use the playground or open an issue.');
  ```
  And surface a build-time warning. (Generator continues; the method shell exists but the body line throws.)

Also: the `inputType` for urlencoded/multipart endpoints needs to derive from `bodyForm` instead of `requestBody`. Reuse the same shape used for query params (since `bodyForm` is `ParamDef[]`):

```ts
if (endpoint.bodyContentType === 'urlencoded' || endpoint.bodyContentType === 'multipart') {
  if (endpoint.bodyForm && endpoint.bodyForm.length > 0) {
    const fields = endpoint.bodyForm.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ body: { ${fields} } }`);
  }
} else if (endpoint.requestBody) {
  parts.push(`{ body: ${tsRefType(endpoint.requestBody, spec)} }`);
}
```

### OpenAPI exporter / importer

`packages/core/src/exporters/openapi.ts`:

- Existing exporter writes `requestBody.content['application/json'].schema = ...` — that path already works for json. Extend:
  - `bodyContentType === 'urlencoded'` → `content['application/x-www-form-urlencoded'].schema = { type: 'object', properties: {…from bodyForm}, required: [...] }`.
  - `bodyContentType === 'multipart'` → `content['multipart/form-data'].schema = ...` (same shape).

Importer (`fromOpenApi`): if `requestBody.content` has the urlencoded or multipart key (instead of or in addition to JSON), set `bodyContentType` accordingly and populate `bodyForm` from the schema's properties.

### Tests

- `packages/core/tests/schema/migrations.test.ts`: v4 spec migrates to v5 by stamping the version.
- `packages/core/tests/runner/buildRequest.test.ts` extended:
  - urlencoded body produces `URLSearchParams.toString()` content + correct header.
  - multipart body produces FormData (assert via testing the runner's behaviour).
  - json (current) still works.
  - Substitution applies to form values too.
- `packages/core/tests/runner/send.test.ts`: ensure transport receives the right shape for each body type.
- `apps/web/tests/ui/EndpointEditor.bodyType.test.tsx`: switching the dropdown clears the unrelated field; renders ParamTable for non-json.
- `apps/web/tests/ui/RunPanel.bodyType.test.tsx`: urlencoded endpoint renders ParamInputs, json renders textarea.
- `packages/cli/tests/generate/body-content-type.test.ts`: urlencoded endpoint generates URLSearchParams body; multipart generates the `throw` placeholder.
- `packages/core/tests/exporters/openapi.test.ts`: urlencoded round-trip via export → import.

### Risks

- **Desktop IPC + FormData**: `FormData` is not structured-cloneable. v1 workaround: send `[name, value][]` over IPC and reconstruct. Verify experimentally. If reconstruction fails, document multipart as browser-only for v1.
- **inputs.body shape ambiguity**: today `inputs.body: unknown` (anything JSON-serializable). For form bodies it's `Record<string,string>`. Existing code that doesn't differentiate may misbehave. Audit `runner/curl.ts`, `apps/web/src/ui/RunPanel.tsx`, `apps/web/src/runner/batch.ts`.
- **Backward compat in OpenAPI export**: existing specs without bodyContentType still emit `application/json` paths. Verified by existing exporter tests.
- **Substitution for form values**: today's substitution operates on the JSON body via `substituteInValue`. For form bodies (already strings), call `sub(value)` directly. Make sure the missing-vars list still aggregates.
- **EndpointEditor UI clutter**: the dropdown + conditional editor adds visual noise. Use existing styling tokens; don't introduce new components if a `<select>` works.
- **Schema migration testing**: every existing spec fixture must round-trip cleanly (load v4 → migrated to v5 → save → identical aside from `schemaVersion`). Existing migration framework already handles this pattern.

## Done definition

- Schema at v5; v4 → v5 migration shipped.
- `bodyContentType` + `bodyForm` fields on `Endpoint`.
- Runner branches correctly for json / urlencoded / multipart.
- EndpointEditor + RunPanel render the right editor per body type.
- Codegen handles urlencoded; multipart placeholder throws clearly.
- OpenAPI exporter/importer round-trips body content types.
- Desktop IPC transport handles multipart via field-array workaround (or documented browser-only).
- All existing tests pass; new tests cover the new branches.
- TODO entry ticked, follow-up "Body UX v1.1 — file uploads" added.
- Spec + plan moved to `done/`.
- Branch `plan/body-ux-overhaul` pushed (PR base = `main`).
