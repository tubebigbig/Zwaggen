# Body UX overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support `application/x-www-form-urlencoded` + `multipart/form-data` request bodies end-to-end (schema → runner → UI → codegen → OpenAPI round-trip), with the JSON path unchanged.

**Architecture:** Schema bumped v4 → v5 with two new optional Endpoint fields (`bodyContentType`, `bodyForm`). Runner branches in `buildRequest` to produce JSON / URLSearchParams / FormData. UI reuses existing `ParamTable` (editor) + `ParamInputs` (runner) for non-JSON body fields. Codegen emits URLSearchParams for urlencoded; multipart throws a clear placeholder. Desktop IPC serializes FormData as `[name,value][]` arrays since FormData isn't structured-cloneable.

**Tech Stack:** Existing — TypeScript, Electron, vitest, React. No new deps.

---

### Spec

See `docs/specs/active/2026-04-23-body-ux-overhaul.md`. Key constraints:

- **No breaking changes** for v4 specs — `bodyContentType: undefined` ≡ `'json'`.
- File upload (a `'file'` TypeDef kind) is **out of scope**; multipart in v1 is text-fields-only.
- Multipart codegen throws a clear "not yet supported" placeholder.

---

### Task 1: Schema v5 — types + migration + v4 snapshot

**Files:**
- Modify: `packages/core/src/schema/types.ts` — bump `CURRENT_SCHEMA_VERSION` to 5; add `BodyContentType` + the two new `Endpoint` fields.
- Create: `packages/core/src/schema/versions/v4.ts` — snapshot of the v4 Endpoint shape.
- Modify: `packages/core/src/schema/migrations.ts` — append a v4→v5 migrator.
- Modify: `packages/core/tests/schema/migrations.test.ts` — add a v4→v5 round-trip test.

- [ ] **Step 1: Snapshot v4 Endpoint type**

```ts
// packages/core/src/schema/versions/v4.ts
import type { TypeDef, ParamDef, ResponseDef, AuthPreset, Assertions, Capture, HttpMethod, Environment } from '../types';

export interface EndpointV4 {
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
  extensions?: Record<string, unknown>;
}

export interface SpecV4 {
  schemaVersion: 4;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: EndpointV4[];
}
```

- [ ] **Step 2: Bump version + add fields in `types.ts`**

```ts
export const CURRENT_SCHEMA_VERSION = 5 as const;

export type BodyContentType = 'json' | 'urlencoded' | 'multipart';

export interface Endpoint {
  // ... existing fields unchanged ...
  requestBody: TypeDef | null;
  bodyContentType?: BodyContentType;   // NEW — undefined ≡ 'json'
  bodyForm?: ParamDef[];               // NEW — used when urlencoded or multipart
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Append v4→v5 migrator**

In `packages/core/src/schema/migrations.ts`:

```ts
import type { SpecV4 } from './versions/v4';

// ... existing entries ...
{
  from: 4,
  to: 5,
  // v4 → v5: added optional bodyContentType + bodyForm. Existing endpoints
  // get neither (both fields are optional); runner treats absence as 'json'.
  migrate: (spec: SpecV4): Spec => ({ ...spec, schemaVersion: 5 }) as unknown as Spec,
},
```

- [ ] **Step 4: Migration test**

```ts
test('v4 spec migrates to v5 by stamping schemaVersion only', () => {
  const v4 = { schemaVersion: 4, info: { name: 'X' }, /* ... */ } as any;
  const v5 = fromJSON(v4);
  expect(v5.schemaVersion).toBe(5);
  expect(v5.endpoints).toEqual(v4.endpoints);
});
```

- [ ] **Step 5: Run core tests**

```bash
pnpm --filter @zwaggen/core test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema/types.ts packages/core/src/schema/versions/v4.ts packages/core/src/schema/migrations.ts packages/core/tests/schema/migrations.test.ts
git commit -m "$(cat <<'EOF'
feat(core/schema): bump to v5 with optional bodyContentType + bodyForm

v5 adds two optional Endpoint fields backing form-encoded and multipart
bodies. v4 → v5 migration is a no-op stamp; absence of bodyContentType
keeps the runner on the JSON path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Runner — buildRequest branches for urlencoded + multipart

**Files:**
- Modify: `packages/core/src/runner/send.ts` — branch in `buildRequest`; widen `BuiltRequest`.
- Modify: `packages/core/src/runner/transport.ts` — widen `TransportRequest` to optionally carry `bodyMultipart`.
- Modify: `packages/core/tests/runner/buildRequest.test.ts` — new tests for each body type.
- Modify: `packages/core/tests/runner/send.test.ts` — confirm fetch sees the right body.

- [ ] **Step 1: Add failing tests for urlencoded + multipart**

In `buildRequest.test.ts`:

```ts
test('urlencoded body: produces URLSearchParams string + correct Content-Type', () => {
  const ep: Endpoint = {
    id: 'e', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [], requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [
      { name: 'username', required: true, type: { kind: 'string' } },
      { name: 'password', required: true, type: { kind: 'string' } },
    ],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
  const built = buildRequest({
    spec: emptySpec(), endpoint: ep, baseUrl: 'http://api',
    inputs: { path: {}, query: {}, headers: {}, body: { username: 'a', password: 'p&q' } },
    secrets: {},
  });
  expect(built.bodyText).toBe('username=a&password=p%26q');
  expect(built.headers['content-type']).toBe('application/x-www-form-urlencoded');
});

test('multipart body: produces FormData and DOES NOT set content-type', () => {
  const ep: Endpoint = { /* ... bodyContentType: 'multipart', bodyForm: [...] ... */ };
  const built = buildRequest({ ... });
  expect(built.bodyMultipart).toBeInstanceOf(FormData);
  expect(built.bodyMultipart!.get('field')).toBe('value');
  expect(built.headers['content-type']).toBeUndefined();
});

test('json body still works exactly as before', () => {
  // existing test, verify no regression
});
```

- [ ] **Step 2: Implement the branches**

In `buildRequest` (`packages/core/src/runner/send.ts`):

```ts
const contentType: BodyContentType = req.endpoint.bodyContentType ?? 'json';
let bodyText: string | undefined;
let bodyMultipart: FormData | undefined;

if (contentType === 'json' && req.endpoint.requestBody && req.inputs.body !== undefined) {
  bodyText = JSON.stringify(substituteInValue(req.inputs.body, sub));
  headers['content-type'] = 'application/json';
} else if (contentType === 'urlencoded' && req.inputs.body && typeof req.inputs.body === 'object') {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.inputs.body as Record<string, unknown>)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, sub(String(v)));
  }
  bodyText = params.toString();
  headers['content-type'] = 'application/x-www-form-urlencoded';
} else if (contentType === 'multipart' && req.inputs.body && typeof req.inputs.body === 'object') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(req.inputs.body as Record<string, unknown>)) {
    if (v !== undefined && v !== null && v !== '') fd.append(k, sub(String(v)));
  }
  bodyMultipart = fd;
  // intentionally NOT setting content-type — fetch sets it with boundary
}
```

Widen `BuiltRequest`:
```ts
export interface BuiltRequest {
  // ... existing ...
  bodyText?: string;
  bodyMultipart?: FormData;
  // ... existing ...
}
```

In `sendRequest`, pass through to transport:
```ts
const resp = await transport({
  method: built.method,
  url: target,
  headers: built.headers,
  bodyText: built.bodyText,
  bodyMultipart: built.bodyMultipart,
});
```

- [ ] **Step 3: Widen `Transport` types in `transport.ts`**

```ts
export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
  bodyMultipart?: FormData;
}
```

`fetchTransport` chooses which body to pass to `fetch()`:
```ts
body: req.bodyMultipart ?? req.bodyText,
```

- [ ] **Step 4: Run all core tests**

```bash
pnpm --filter @zwaggen/core test
```

Expected: green (3+ new tests; existing tests untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runner/send.ts packages/core/src/runner/transport.ts packages/core/tests/runner/
git commit -m "$(cat <<'EOF'
feat(core/runner): build urlencoded + multipart bodies in buildRequest

URLSearchParams for urlencoded (Content-Type set automatically);
FormData for multipart (Content-Type left to fetch's boundary handling).
Transport interface widens with bodyMultipart? — fetchTransport prefers
multipart over text when both present.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Desktop IPC — multipart over IPC via [name,value][] array

**Files:**
- Modify: `apps/desktop/electron/ipc.ts` — `handleHttp` reconstructs `FormData` from `multipartFields`.
- Modify: `apps/desktop/electron/preload.ts` — bridge serializes `FormData` to `[name,value][]` before sending.
- Modify: `apps/web/src/bootstrap.ts` — the renderer adapter wraps `bridge.sendHttpRequest` to perform the FormData serialization.
- Modify: `apps/desktop/electron/__tests__/ipc.test.ts` — handleHttp accepts multipartFields and builds the right body.

- [ ] **Step 1: Failing test in `ipc.test.ts`**

```ts
test('handleHttp accepts multipartFields and builds FormData', async () => {
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  globalThis.fetch = fetchSpy as any;

  await handleHttp({
    method: 'POST',
    url: 'http://api/upload',
    headers: {},
    multipartFields: [['field', 'value'], ['name', 'a&b']],
  });
  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get('field')).toBe('value');
  expect((init.body as FormData).get('name')).toBe('a&b');
});

test('isTransportRequest accepts multipartFields shape', () => {
  expect(isTransportRequest({ method: 'POST', url: 'http://x/y', headers: {}, multipartFields: [['a', 'b']] })).toBe(true);
});
```

- [ ] **Step 2: Update `isTransportRequest` and `handleHttp`**

```ts
export interface TransportRequestPayload extends TransportRequest {
  multipartFields?: [string, string][];
}

export function isTransportRequest(v: unknown): v is TransportRequestPayload {
  // ... existing checks ...
  if (r.multipartFields !== undefined) {
    if (!Array.isArray(r.multipartFields)) return false;
    for (const item of r.multipartFields) {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || typeof item[1] !== 'string') return false;
    }
  }
  return true;
}

export async function handleHttp(payload: unknown): Promise<TransportResponse> {
  if (!isTransportRequest(payload)) throw new Error('invalid http payload');
  const init: RequestInit = {
    method: payload.method,
    headers: payload.headers,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  };
  if (payload.multipartFields) {
    const fd = new FormData();
    for (const [k, v] of payload.multipartFields) fd.append(k, v);
    init.body = fd;
  } else {
    init.body = payload.bodyText;
  }
  const resp = await fetch(payload.url, init);
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Bootstrap adapter serializes FormData to multipartFields before invoking the bridge**

In `apps/web/src/bootstrap.ts`, wrap `bridge.sendHttpRequest`:

```ts
const transport: Transport = async (req) => {
  if (req.bodyMultipart) {
    const fields: [string, string][] = [];
    req.bodyMultipart.forEach((v, k) => { if (typeof v === 'string') fields.push([k, v]); });
    return bridge.sendHttpRequest({ method: req.method, url: req.url, headers: req.headers, multipartFields: fields });
  }
  return bridge.sendHttpRequest({ method: req.method, url: req.url, headers: req.headers, bodyText: req.bodyText });
};
setTransport(transport);
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @zwaggen/desktop test
pnpm --filter web test -- bootstrap
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/ipc.ts apps/desktop/electron/__tests__/ipc.test.ts apps/web/src/bootstrap.ts apps/desktop/electron/preload.ts
git commit -m "$(cat <<'EOF'
feat(desktop): multipart bodies over IPC via [name,value][] array

FormData isn't structured-cloneable across Electron IPC, so the
bootstrap adapter serializes FormData → string-pair array before invoke,
and main reconstructs FormData before fetch. Pure-text values only in
v1 (file fields land with Body UX v1.1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: EndpointEditor — body type dropdown + ParamTable for non-json

**Files:**
- Modify: `apps/web/src/ui/EndpointEditor.tsx`
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — labels for body types.
- Create: `apps/web/tests/ui/EndpointEditor.bodyType.test.tsx`

- [ ] **Step 1: Add i18n strings**

en:
```json
"bodyTypeJson": "JSON",
"bodyTypeUrlencoded": "URL-encoded form",
"bodyTypeMultipart": "Multipart form (text only)",
"bodyType": "Body type",
"formFields": "Form fields"
```

zh-TW:
```json
"bodyTypeJson": "JSON",
"bodyTypeUrlencoded": "URL-encoded 表單",
"bodyTypeMultipart": "Multipart 表單(僅文字)",
"bodyType": "請求內容類型",
"formFields": "表單欄位"
```

- [ ] **Step 2: Add a body-type selector in EndpointEditor**

Find the existing requestBody section (`<h3>{t('requestBody')}</h3>` block). Add above it:

```tsx
<select
  className="input text-xs"
  value={ep.bodyContentType ?? 'json'}
  onChange={(e) => {
    const next = e.target.value as 'json' | 'urlencoded' | 'multipart';
    if (next === 'json') {
      patch({ bodyContentType: undefined, bodyForm: undefined });
    } else {
      patch({ bodyContentType: next, requestBody: null, bodyForm: ep.bodyForm ?? [] });
    }
  }}
>
  <option value="json">{t('bodyTypeJson')}</option>
  <option value="urlencoded">{t('bodyTypeUrlencoded')}</option>
  <option value="multipart">{t('bodyTypeMultipart')}</option>
</select>
```

Replace the existing requestBody-toggle + TypeBuilder with:

```tsx
{(ep.bodyContentType ?? 'json') === 'json' ? (
  <>
    <label>
      <input type="checkbox" checked={!!ep.requestBody} onChange={...} />
      {t('hasBody')}
    </label>
    {ep.requestBody && <TypeBuilder ... />}
  </>
) : (
  <ParamTable
    title={t('formFields')}
    value={ep.bodyForm ?? []}
    onChange={(v) => patch({ bodyForm: v })}
    typeNames={Object.keys(spec.types)}
  />
)}
```

(Adapt to actual existing markup. Switching body type clears the unused field.)

- [ ] **Step 3: Test**

```tsx
test('switching body type from JSON to urlencoded clears requestBody and shows ParamTable', () => {
  // render EndpointEditor with a json endpoint
  // change select to urlencoded
  // assert requestBody is null and ParamTable is visible
});

test('switching back to JSON clears bodyForm', () => { ... });
```

- [ ] **Step 4: Run web suite**

```bash
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/EndpointEditor.tsx apps/web/src/i18n apps/web/tests/ui/EndpointEditor.bodyType.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): EndpointEditor body-type dropdown + ParamTable for non-JSON bodies

Reuses ParamTable for the form-fields editor when bodyContentType is
urlencoded or multipart. Switching types clears the unused field
shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: RunPanel — render body fields based on type

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Create: `apps/web/tests/ui/RunPanel.bodyType.test.tsx`

- [ ] **Step 1: Add per-body-type input state**

```tsx
const [bodyText, setBodyText] = useState<string>('{}');
const [bodyFormVals, setBodyFormVals] = useState<Record<string, string>>({});
```

Reset both when endpoint changes (mirror existing reset effects).

- [ ] **Step 2: Render the right editor**

Replace the existing `endpoint.requestBody &&` block:

```tsx
{(endpoint.bodyContentType ?? 'json') === 'json' && endpoint.requestBody && (
  <textarea ... existing ... />
)}
{(endpoint.bodyContentType === 'urlencoded' || endpoint.bodyContentType === 'multipart') && (endpoint.bodyForm?.length ?? 0) > 0 && (
  <ParamInputs
    label={t('formFields')}
    params={endpoint.bodyForm!}
    values={bodyFormVals}
    onChange={setBodyFormVals}
  />
)}
```

- [ ] **Step 3: Build inputs.body based on type when running**

Replace the existing body-parsing block:

```tsx
let body: unknown = undefined;
const ct = endpoint.bodyContentType ?? 'json';
if (ct === 'json' && endpoint.requestBody) {
  try { body = JSON.parse(bodyText); }
  catch { return setResult({ ... 'Bad JSON' ... }); }
} else if ((ct === 'urlencoded' || ct === 'multipart') && (endpoint.bodyForm?.length ?? 0) > 0) {
  body = bodyFormVals;
}
```

- [ ] **Step 4: Test**

```tsx
test('urlencoded endpoint renders ParamInputs and posts form values', async () => {
  // mock fetch
  // render RunPanel with a urlencoded endpoint
  // type into form field
  // click Run
  // assert fetch was called with body: 'name=value' and content-type urlencoded
});
```

- [ ] **Step 5: Run web suite**

```bash
pnpm --filter web test
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/RunPanel.tsx apps/web/tests/ui/RunPanel.bodyType.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): RunPanel renders body fields based on bodyContentType

JSON keeps the textarea; urlencoded + multipart get ParamInputs key/value
rows. Runner serializes accordingly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Codegen — URLSearchParams for urlencoded; multipart placeholder

**Files:**
- Modify: `packages/cli/src/generate/client.ts`
- Modify: `packages/cli/tests/generate/client.test.ts`

- [ ] **Step 1: Branch on `endpoint.bodyContentType` in `inputTypeFor`**

```ts
function inputTypeFor(endpoint: Endpoint, spec: Spec): string {
  // ... pathParams, queryParams, headers branches unchanged ...
  const ct = endpoint.bodyContentType ?? 'json';
  if ((ct === 'urlencoded' || ct === 'multipart') && endpoint.bodyForm && endpoint.bodyForm.length > 0) {
    const fields = endpoint.bodyForm.map((p) => `${safeIdentifier(p.name)}${p.required ? '' : '?'}: ${tsRefType(p.type, spec)}`).join('; ');
    parts.push(`{ body: { ${fields} } }`);
  } else if (ct === 'json' && endpoint.requestBody) {
    parts.push(`{ body: ${tsRefType(endpoint.requestBody, spec)} }`);
  }
  // ...
}
```

- [ ] **Step 2: Branch in `buildFetchOptsExpr`**

```ts
function buildFetchOptsExpr(endpoint: Endpoint): string {
  const ct = endpoint.bodyContentType ?? 'json';
  // ... headers logic ...

  if (ct === 'urlencoded' && endpoint.bodyForm && endpoint.bodyForm.length > 0) {
    return `{ method: '${endpoint.method}', headers: { ...(await baseHeaders()), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(input.body as Record<string, string>).toString() }`;
  }
  if (ct === 'multipart' && endpoint.bodyForm && endpoint.bodyForm.length > 0) {
    // Throw at runtime — multipart codegen lands in v1.2.
    return `(() => { throw new Error('Codegen: multipart bodies not yet supported. Use the playground or open an issue.'); })()`;
  }
  // ... existing json + GET/HEAD branches ...
}
```

- [ ] **Step 3: Test**

```ts
test('urlencoded endpoint generates URLSearchParams body', () => {
  const out = generateClient(spec /* with urlencoded endpoint */);
  expect(out).toContain("'content-type': 'application/x-www-form-urlencoded'");
  expect(out).toContain('new URLSearchParams(input.body as Record<string, string>).toString()');
});

test('multipart endpoint generates a clear runtime throw', () => {
  const out = generateClient(spec /* with multipart endpoint */);
  expect(out).toContain('multipart bodies not yet supported');
});
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/generate/client.ts packages/cli/tests/generate/
git commit -m "$(cat <<'EOF'
feat(cli/codegen): URLSearchParams for urlencoded; multipart placeholder

Codegen now respects endpoint.bodyContentType: urlencoded emits a
URLSearchParams body + correct Content-Type; multipart emits a clear
runtime throw until v1.2 lands real multipart support.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: OpenAPI exporter / importer round-trip

**Files:**
- Modify: `packages/core/src/exporters/openapi.ts`
- Modify: `packages/core/src/importers/openapi.ts` (if separate; else the same file)
- Modify: `packages/core/tests/exporters/openapi.test.ts`

- [ ] **Step 1: Exporter — write the right `requestBody.content` key**

Find where the exporter writes `requestBody.content['application/json'].schema`. Switch on `endpoint.bodyContentType`:

```ts
const ct = endpoint.bodyContentType ?? 'json';
const mime =
  ct === 'urlencoded' ? 'application/x-www-form-urlencoded' :
  ct === 'multipart' ? 'multipart/form-data' :
  'application/json';
const schema = ct === 'json'
  ? typeDefToOpenApi(endpoint.requestBody, spec)
  : { type: 'object', properties: paramDefArrayToProperties(endpoint.bodyForm ?? []), required: (endpoint.bodyForm ?? []).filter(p => p.required).map(p => p.name) };
op.requestBody = { content: { [mime]: { schema } }, required: true };
```

- [ ] **Step 2: Importer — read the content key**

When reading `requestBody.content`, check which key is present and set `bodyContentType` + populate either `requestBody` or `bodyForm`:

```ts
const content = doc.requestBody?.content;
if (content?.['application/x-www-form-urlencoded']) {
  ep.bodyContentType = 'urlencoded';
  ep.bodyForm = openApiPropertiesToParamDefs(content['application/x-www-form-urlencoded'].schema);
} else if (content?.['multipart/form-data']) {
  ep.bodyContentType = 'multipart';
  ep.bodyForm = openApiPropertiesToParamDefs(content['multipart/form-data'].schema);
} else if (content?.['application/json']) {
  ep.requestBody = openApiToTypeDef(content['application/json'].schema);
}
```

- [ ] **Step 3: Round-trip test**

```ts
test('urlencoded body round-trips through OpenAPI export and import', () => {
  const spec = { /* ... endpoint with bodyContentType urlencoded + bodyForm ... */ };
  const oapi = toOpenApi(spec);
  const back = fromOpenApi(oapi).spec;
  expect(back.endpoints[0].bodyContentType).toBe('urlencoded');
  expect(back.endpoints[0].bodyForm).toEqual(spec.endpoints[0].bodyForm);
});

test('multipart body round-trips through OpenAPI', () => { /* same shape */ });
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @zwaggen/core test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/exporters/openapi.ts packages/core/tests/exporters/openapi.test.ts
git commit -m "$(cat <<'EOF'
feat(core/exporters): OpenAPI round-trip for urlencoded + multipart bodies

Exporter writes the right requestBody.content key based on
bodyContentType; importer maps back to bodyContentType + bodyForm. JSON
path unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Tick TODO + log v1.1 follow-up + move spec/plan

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Final sweep**

```bash
pnpm install
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/core build
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter @zwaggen/desktop build
pnpm --filter @zwaggen/desktop test
pnpm --filter @zwaggen/desktop e2e
```

Every step green.

- [ ] **Step 2: Tick TODO + add follow-up bullet**

Add to docs/TODO.md (Feature section or wherever fits):

```
- [x] Body UX overhaul — schema v5 with bodyContentType + bodyForm; runner produces URLSearchParams / FormData / JSON; EndpointEditor + RunPanel get key/value rows for non-JSON bodies; codegen handles urlencoded; OpenAPI round-trip. See `docs/plans/done/2026-04-23-body-ux-overhaul.md`.
- [ ] Body UX v1.1 — file uploads. Add a `'file'` TypeDef kind, File picker UI in RunPanel for multipart endpoints, codegen emits FormData with proper File handling, IPC bridge sends File objects via ArrayBuffer chunks. Surfaced from Body UX v1.
```

Update "Last updated" stamp.

- [ ] **Step 3: Move docs**

```bash
git mv docs/specs/active/2026-04-23-body-ux-overhaul.md docs/specs/done/
git mv docs/plans/active/2026-04-23-body-ux-overhaul.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship body-ux-overhaul — move spec+plan to done

Adds Body UX v1.1 (file uploads) follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 8 tasks ticked.
- Schema at v5; v4 migrations stamp version, no data change.
- Runner: 3 body types tested.
- Desktop IPC: multipart works via the [name,value][] workaround.
- EndpointEditor + RunPanel render the right editor per body type.
- Codegen: urlencoded works; multipart placeholder throws clearly.
- OpenAPI round-trip: all three content types.
- All cross-package tests green.
- Branch `plan/body-ux-overhaul` ready to push (PR base = `main`).
