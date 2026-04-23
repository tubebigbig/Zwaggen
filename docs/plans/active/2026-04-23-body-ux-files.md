# Body UX v1.1 — file uploads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `multipart/form-data` file upload support end-to-end: schema (`'file'` TypeDef kind, v6 bump), runner (File/Blob handling), desktop IPC (bytes over IPC with size caps), UI (file picker), codegen (real FormData generation, no more throw placeholder), OpenAPI round-trip.

**Architecture:** New `FileType { kind: 'file' }` in the `TypeDef` union. Schema v5 → v6 no-op migration. Validator rejects file kind outside multipart bodyForm. Runner appends File/Blob to FormData. Desktop bootstrap adapter serializes Files via `arrayBuffer()` into the extended `MultipartField` shape; main reconstructs File from bytes. RunPanel renders `<input type="file">` for file fields; TypeBuilder offers File as a kind only for multipart bodyForm context. Codegen replaces v1's throw placeholder with proper FormData emission.

**Tech Stack:** TypeScript, Electron, vitest, React, no new deps. Stacks on `main`.

---

### Spec

See `docs/specs/active/2026-04-23-body-ux-files.md`. Key constraints:

- `'file'` is **only valid inside multipart `bodyForm`**. Validator enforces.
- 50MB per-file + 100MB total IPC ceiling. Error before invoke.
- Codegen REMOVES the v1 throw placeholder for multipart endpoints.

---

### Task 1: Schema v6 — add `FileType` + validator + migration

**Files:**
- Modify: `packages/core/src/schema/types.ts` — bump CURRENT_SCHEMA_VERSION to 6; add `FileType` and extend `TypeDef`.
- Create: `packages/core/src/schema/versions/v5.ts` — snapshot of v5 Endpoint/Spec.
- Modify: `packages/core/src/schema/migrations.ts` — append v5 → v6 migrator.
- Create: `packages/core/src/schema/validateFileType.ts` — validator that walks a Spec and flags illegal `FileType` placements.
- Modify: `packages/core/tests/schema/migrations.test.ts` — add v5 → v6 round-trip test.
- Create: `packages/core/tests/schema/validateFileType.test.ts` — tests for the new validator.

- [ ] **Step 1: Snapshot v5 + bump version + add FileType**

In `packages/core/src/schema/types.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 6 as const;

export interface FileType {
  kind: 'file';
  description?: string;
  /** Optional MIME filter for the picker, e.g. 'image/*'. */
  accept?: string;
  /** Soft picker warning threshold in bytes. Runner enforces a hard 50MB cap regardless. */
  maxBytes?: number;
}

export type TypeDef =
  | StringType | NumberType | IntegerType | BooleanType | NullType
  | LiteralType | ArrayType | ObjectType | UnionType | RefType
  | FileType;
```

Snapshot v5 in `versions/v5.ts` (mirror current Spec/Endpoint without FileType — just for the migrator's `SpecV5` type).

- [ ] **Step 2: Append v5 → v6 migrator**

In `migrations.ts`:

```ts
import type { SpecV5 } from './versions/v5';

// ...
{
  from: 5,
  to: 6,
  migrate: (spec: SpecV5): Spec => ({ ...spec, schemaVersion: 6 }) as unknown as Spec,
},
```

- [ ] **Step 3: Migration test**

```ts
test('v5 spec migrates to v6 by stamping schemaVersion only', () => {
  const v5 = { schemaVersion: 5, info: { name: 'X' }, /* ... */ } as any;
  const v6 = fromJSON(v5);
  expect(v6.schemaVersion).toBe(6);
});
```

- [ ] **Step 4: Write the validator**

`packages/core/src/schema/validateFileType.ts`:

```ts
import type { Spec, TypeDef } from './types';

export interface FileTypePlacementError { where: string; message: string }

function containsFileType(def: TypeDef): boolean {
  if (def.kind === 'file') return true;
  if (def.kind === 'array') return containsFileType(def.element);
  if (def.kind === 'object') return def.fields.some((f) => containsFileType(f.type));
  if (def.kind === 'union') return def.variants.some(containsFileType);
  return false;
}

export function findIllegalFileTypes(spec: Spec): FileTypePlacementError[] {
  const errors: FileTypePlacementError[] = [];

  for (const [name, def] of Object.entries(spec.types)) {
    if (containsFileType(def)) {
      errors.push({ where: `types.${name}`, message: 'file type not allowed in named types (only in multipart bodyForm)' });
    }
  }

  for (const ep of spec.endpoints) {
    if (ep.requestBody && containsFileType(ep.requestBody)) {
      errors.push({ where: `endpoints.${ep.id}.requestBody`, message: 'file type not allowed in requestBody (only in multipart bodyForm)' });
    }
    for (const r of ep.responses) {
      if (containsFileType(r.type)) {
        errors.push({ where: `endpoints.${ep.id}.responses[${r.status}]`, message: 'file type not allowed in responses' });
      }
    }
    for (const p of ep.pathParams) if (containsFileType(p.type)) errors.push({ where: `endpoints.${ep.id}.pathParams.${p.name}`, message: 'file type not allowed in path params' });
    for (const p of ep.queryParams) if (containsFileType(p.type)) errors.push({ where: `endpoints.${ep.id}.queryParams.${p.name}`, message: 'file type not allowed in query params' });
    for (const p of ep.headers) if (containsFileType(p.type)) errors.push({ where: `endpoints.${ep.id}.headers.${p.name}`, message: 'file type not allowed in headers' });

    if (ep.bodyForm && ep.bodyContentType !== 'multipart') {
      for (const p of ep.bodyForm) {
        if (containsFileType(p.type)) {
          errors.push({ where: `endpoints.${ep.id}.bodyForm.${p.name}`, message: 'file type only valid for multipart endpoints (current bodyContentType: ' + (ep.bodyContentType ?? 'json') + ')' });
        }
      }
    }
  }

  return errors;
}
```

- [ ] **Step 5: Validator tests**

```ts
test('flags file type in named types', () => {
  const spec = { ...emptySpec(), types: { Foo: { kind: 'file' } } };
  const errs = findIllegalFileTypes(spec);
  expect(errs).toHaveLength(1);
  expect(errs[0]!.where).toBe('types.Foo');
});

test('flags file type in urlencoded bodyForm', () => {
  const spec = { ...emptySpec(), endpoints: [{
    id: 'e', method: 'POST', path: '/', tags: [], pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [{ name: 'attachment', required: true, type: { kind: 'file' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  }] };
  const errs = findIllegalFileTypes(spec);
  expect(errs).toHaveLength(1);
  expect(errs[0]!.where).toContain('bodyForm.attachment');
});

test('accepts file type in multipart bodyForm', () => {
  const spec = { ...emptySpec(), endpoints: [{
    id: 'e', method: 'POST', path: '/', tags: [], pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [{ name: 'file', required: true, type: { kind: 'file' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  }] };
  expect(findIllegalFileTypes(spec)).toEqual([]);
});

test('walks nested arrays/objects/unions for file types', () => {
  // Should be flagged because file type is nested inside an array inside a named type
  const spec = { ...emptySpec(), types: { Foo: { kind: 'array', element: { kind: 'file' } } } };
  expect(findIllegalFileTypes(spec)).toHaveLength(1);
});
```

- [ ] **Step 6: Run + commit**

```bash
pnpm --filter @zwaggen/core test
git add packages/core/src/schema/types.ts packages/core/src/schema/versions/v5.ts packages/core/src/schema/migrations.ts packages/core/src/schema/validateFileType.ts packages/core/tests/schema/
git commit -m "$(cat <<'EOF'
feat(core/schema): bump to v6 with FileType + placement validator

v6 adds a `'file'` member to TypeDef. New validator walks the Spec and
flags illegal placements (anywhere outside multipart bodyForm). v5 → v6
migration stamps the version (no data change).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Runner accepts File/Blob in multipart

**Files:**
- Modify: `packages/core/src/runner/send.ts` — multipart branch in `buildRequest`.
- Modify: `packages/core/tests/runner/buildRequest.test.ts` — file field tests.

- [ ] **Step 1: Failing test**

```ts
test('multipart body appends File with its name', () => {
  const ep: Endpoint = {
    id: 'e', method: 'POST', path: '/upload', tags: [],
    pathParams: [], queryParams: [], headers: [], requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [
      { name: 'note', required: true, type: { kind: 'string' } },
      { name: 'attachment', required: true, type: { kind: 'file' } },
    ],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
  const file = new File([new Uint8Array([1, 2, 3])], 'hello.txt', { type: 'text/plain' });
  const built = buildRequest({
    spec: emptySpec(), endpoint: ep, baseUrl: 'http://api',
    inputs: { path: {}, query: {}, headers: {}, body: { note: 'hi', attachment: file } },
    secrets: {},
  });
  expect(built.bodyMultipart).toBeInstanceOf(FormData);
  const fd = built.bodyMultipart!;
  expect(fd.get('note')).toBe('hi');
  const f = fd.get('attachment') as File;
  expect(f).toBeInstanceOf(File);
  expect(f.name).toBe('hello.txt');
  expect(f.type).toBe('text/plain');
});

test('multipart body skips empty/undefined file fields', () => {
  // ... assert that an undefined file field doesn't appear in the FormData ...
});
```

- [ ] **Step 2: Update the multipart branch in `buildRequest`**

```ts
} else if (contentType === 'multipart' && req.inputs.body && typeof req.inputs.body === 'object') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(req.inputs.body as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue;
    if (v instanceof File) {
      fd.append(k, v, v.name);
    } else if (v instanceof Blob) {
      fd.append(k, v);
    } else {
      fd.append(k, sub(String(v)));
    }
  }
  bodyMultipart = fd;
}
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @zwaggen/core test
git add packages/core/src/runner/send.ts packages/core/tests/runner/buildRequest.test.ts
git commit -m "$(cat <<'EOF'
feat(core/runner): append File/Blob values to multipart FormData

Multipart bodyForm fields with values that are File or Blob are now
appended directly (preserving filename for File). Plain string values
keep going through substitution; empty/undefined fields are skipped.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Desktop IPC — bytes over IPC + size caps

**Files:**
- Modify: `apps/desktop/electron/ipc.ts` — extend `MultipartField` + validation + handler.
- Modify: `apps/desktop/electron/__tests__/ipc.test.ts` — file-bytes tests.

- [ ] **Step 1: Failing tests**

```ts
test('handleHttp accepts multipartFields with file bytes and reconstructs FormData', async () => {
  const fetchSpy = vi.fn(async () => new Response('{"ok":true}', {
    status: 200, headers: { 'content-type': 'application/json' },
  }));
  globalThis.fetch = fetchSpy as any;

  await handleHttp({
    method: 'POST', url: 'http://api/upload', headers: {},
    multipartFields: [
      ['note', 'hi'],
      ['attachment', { kind: 'file', name: 'hello.txt', type: 'text/plain', bytes: new Uint8Array([1, 2, 3]) }],
    ],
  });
  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
  const fd = init.body as FormData;
  expect(fd.get('note')).toBe('hi');
  const f = fd.get('attachment') as File;
  expect(f.name).toBe('hello.txt');
  expect(f.type).toBe('text/plain');
});

test('handleHttp rejects single file > 50MB', async () => {
  const big = new Uint8Array(51 * 1024 * 1024);
  await expect(handleHttp({
    method: 'POST', url: 'http://api/upload', headers: {},
    multipartFields: [['big', { kind: 'file', name: 'big.bin', type: 'application/octet-stream', bytes: big }]],
  })).rejects.toThrow(/invalid http payload/);
});

test('handleHttp rejects total payload > 100MB', async () => {
  const chunk = new Uint8Array(40 * 1024 * 1024);
  await expect(handleHttp({
    method: 'POST', url: 'http://api/upload', headers: {},
    multipartFields: [
      ['a', { kind: 'file', name: 'a', type: 'application/octet-stream', bytes: chunk }],
      ['b', { kind: 'file', name: 'b', type: 'application/octet-stream', bytes: chunk }],
      ['c', { kind: 'file', name: 'c', type: 'application/octet-stream', bytes: chunk }],
    ],
  })).rejects.toThrow(/Total multipart payload too large/);
});
```

- [ ] **Step 2: Implement the extended shape**

```ts
const FILE_LIMIT = 50 * 1024 * 1024;
const TOTAL_LIMIT = 100 * 1024 * 1024;

function isFilePayload(v: unknown): v is { kind: 'file'; name: string; type: string; bytes: Uint8Array } {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.kind !== 'file' || typeof r.name !== 'string' || typeof r.type !== 'string') return false;
  if (!(r.bytes instanceof Uint8Array)) return false;
  if (r.bytes.byteLength > FILE_LIMIT) return false;
  return true;
}

// Update isMultipartField to accept the file shape too.
function isMultipartField(v: unknown): v is [string, string] | [string, { kind: 'file'; name: string; type: string; bytes: Uint8Array }] {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'string') return false;
  if (typeof v[1] === 'string') return true;
  return isFilePayload(v[1]);
}

// In handleHttp:
if (payload.multipartFields) {
  let total = 0;
  for (const [, val] of payload.multipartFields) {
    if (typeof val === 'object' && val !== null && 'bytes' in val) total += val.bytes.byteLength;
  }
  if (total > TOTAL_LIMIT) throw new Error(`Total multipart payload too large: ${(total / 1024 / 1024).toFixed(1)}MB. Max 100MB in v1.1.`);
  const fd = new FormData();
  for (const [k, val] of payload.multipartFields) {
    if (typeof val === 'string') fd.append(k, val);
    else fd.append(k, new File([val.bytes], val.name, { type: val.type }));
  }
  init.body = fd;
}
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @zwaggen/desktop test
git add apps/desktop/electron/ipc.ts apps/desktop/electron/__tests__/ipc.test.ts
git commit -m "$(cat <<'EOF'
feat(desktop): file uploads over IPC with 50MB/100MB caps

multipartFields now accepts [name, { kind: 'file', name, type, bytes }]
entries. Main reconstructs File and appends to FormData. 50MB/file +
100MB/total caps throw before fetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Bootstrap adapter serializes File via arrayBuffer

**Files:**
- Modify: `apps/web/src/bootstrap.ts` — extend the multipart serialization path.
- Modify: `apps/web/tests/bootstrap.test.ts` — File serialization test.

- [ ] **Step 1: Failing test**

```ts
test('configureFromBridge serializes FormData File entries to file payloads', async () => {
  const sent: any[] = [];
  const bridge = emptyBridge({
    sendHttpRequest: async (req) => { sent.push(req); return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }; },
  });
  configureFromBridge(bridge);
  const fd = new FormData();
  fd.append('note', 'hi');
  fd.append('file', new File([new Uint8Array([1, 2, 3])], 'hello.txt', { type: 'text/plain' }));

  await getTransport()({ method: 'POST', url: 'http://x/y', headers: {}, bodyMultipart: fd });

  expect(sent[0].multipartFields).toHaveLength(2);
  expect(sent[0].multipartFields[0]).toEqual(['note', 'hi']);
  expect(sent[0].multipartFields[1][0]).toBe('file');
  expect(sent[0].multipartFields[1][1].kind).toBe('file');
  expect(sent[0].multipartFields[1][1].name).toBe('hello.txt');
  expect(sent[0].multipartFields[1][1].type).toBe('text/plain');
  expect(Array.from(sent[0].multipartFields[1][1].bytes)).toEqual([1, 2, 3]);
});

test('configureFromBridge rejects File > 50MB before invoking IPC', async () => {
  const bridge = emptyBridge();
  configureFromBridge(bridge);
  const big = new File([new Uint8Array(51 * 1024 * 1024)], 'big.bin', { type: 'application/octet-stream' });
  const fd = new FormData();
  fd.append('big', big);
  await expect(getTransport()({ method: 'POST', url: 'http://x', headers: {}, bodyMultipart: fd }))
    .rejects.toThrow(/max 50MB/i);
});
```

- [ ] **Step 2: Update the bootstrap transport adapter**

```ts
const FILE_LIMIT = 50 * 1024 * 1024;
const TOTAL_LIMIT = 100 * 1024 * 1024;

async function buildMultipartFields(fd: FormData): Promise<MultipartField[]> {
  const out: MultipartField[] = [];
  let total = 0;
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') {
      out.push([k, v]);
    } else {
      const bytes = new Uint8Array(await v.arrayBuffer());
      if (bytes.byteLength > FILE_LIMIT) {
        throw new Error(`File "${(v as File).name}" is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB; max 50MB in v1.1.`);
      }
      total += bytes.byteLength;
      if (total > TOTAL_LIMIT) {
        throw new Error(`Total multipart payload too large; max 100MB in v1.1.`);
      }
      out.push([k, { kind: 'file', name: (v as File).name, type: v.type || 'application/octet-stream', bytes }]);
    }
  }
  return out;
}

const transport: Transport = async (req) => {
  if (req.bodyMultipart) {
    const fields = await buildMultipartFields(req.bodyMultipart);
    return bridge.sendHttpRequest({ method: req.method, url: req.url, headers: req.headers, multipartFields: fields });
  }
  return bridge.sendHttpRequest({ method: req.method, url: req.url, headers: req.headers, bodyText: req.bodyText });
};
```

(`MultipartField` type lives in the bridge contract — extend `apps/web/src/types/zwaggen-bridge.ts` to mirror the new shape.)

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter web test -- bootstrap
git add apps/web/src/bootstrap.ts apps/web/src/types/zwaggen-bridge.ts apps/web/tests/bootstrap.test.ts
git commit -m "$(cat <<'EOF'
feat(web): bootstrap serializes FormData File entries for IPC

FormData.entries() walked; File values converted via arrayBuffer() to
Uint8Array. Single-file 50MB and total 100MB caps throw before IPC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TypeBuilder / ParamTable — File option (multipart-only)

**Files:**
- Modify: `apps/web/src/ui/TypeBuilder.tsx` (or wherever the type-kind dropdown lives).
- Modify: `apps/web/src/ui/ParamTable.tsx` — accept `allowFileType?: boolean` prop and pass through.
- Modify: `apps/web/src/ui/EndpointEditor.tsx` — pass `allowFileType={ep.bodyContentType === 'multipart'}` for the bodyForm ParamTable only.
- Modify: `apps/web/src/i18n/locales/{en,zh-TW}.json` — add "File" / "檔案" labels.
- Create: `apps/web/tests/ui/EndpointEditor.fileType.test.tsx` — File option visibility per context.

- [ ] **Step 1: i18n strings**

en:
```json
"typeKindFile": "File",
"fileTypeMultipartOnly": "Files only valid for multipart bodies"
```

zh-TW:
```json
"typeKindFile": "檔案",
"fileTypeMultipartOnly": "檔案類型僅適用於 multipart 內容"
```

- [ ] **Step 2: Add File to the type-kind dropdown**

In `TypeBuilder.tsx`, find the type-kind selector. Add `'file'` as an option, gated by an `allowFileType` prop. When the kind is 'file', render optional inputs for `accept` (text) and `maxBytes` (number).

- [ ] **Step 3: Plumb through ParamTable + EndpointEditor**

`ParamTable` accepts `allowFileType?: boolean`. EndpointEditor passes:

```tsx
<ParamTable
  title={t('formFields')}
  value={ep.bodyForm ?? []}
  onChange={(v) => patch({ bodyForm: v })}
  typeNames={Object.keys(spec.types)}
  allowFileType={ep.bodyContentType === 'multipart'}
/>
```

The other ParamTables (path/query/headers, urlencoded body) pass nothing (default false).

- [ ] **Step 4: Test**

```tsx
test('File option appears for multipart bodyForm only', async () => {
  // Render EndpointEditor with multipart endpoint → check File option present
  // Switch to urlencoded → check File option absent (or disabled with tooltip)
});
```

- [ ] **Step 5: Tests pass + commit**

```bash
pnpm --filter web test
pnpm --filter web lint
git add apps/web/src/ui/TypeBuilder.tsx apps/web/src/ui/ParamTable.tsx apps/web/src/ui/EndpointEditor.tsx apps/web/src/i18n apps/web/tests/ui/EndpointEditor.fileType.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): TypeBuilder/ParamTable expose File kind for multipart bodyForm only

EndpointEditor passes allowFileType={bodyContentType === 'multipart'} to
the body-form ParamTable; the type dropdown surfaces "File" only there.
File kind exposes optional accept + maxBytes inputs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: RunPanel — file picker for file fields

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx` — render `<input type="file">` for `type.kind === 'file'`.
- Modify: `apps/web/tests/ui/RunPanel.bodyType.test.tsx` — file-picker test.

- [ ] **Step 1: Failing test**

```tsx
test('multipart endpoint with file field shows file picker and posts the file', async () => {
  const fetchSpy = vi.fn(...);
  globalThis.fetch = fetchSpy as any;
  // Render RunPanel with a multipart endpoint with a file ParamDef
  // Assert <input type="file"> is present
  // Simulate file selection
  // Click Run
  // Assert fetch was called with FormData containing the file
});
```

- [ ] **Step 2: Update RunPanel body-form rendering**

Replace the existing `ParamInputs` block for non-JSON bodies with a custom renderer that branches on each field's `type.kind`:

```tsx
{(ct === 'urlencoded' || ct === 'multipart') && (endpoint.bodyForm?.length ?? 0) > 0 && (
  <div className="block">
    <div className="text-xs text-slate-500">{t('formFields')}</div>
    {endpoint.bodyForm!.map((p) => (
      <div key={p.name} className="flex items-center gap-2">
        <label className="w-32 text-xs">{p.name}</label>
        {p.type.kind === 'file' && ct === 'multipart' ? (
          <input
            type="file"
            accept={p.type.accept}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setBodyFormVals((prev) => f ? { ...prev, [p.name]: f } : (() => { const { [p.name]: _, ...rest } = prev; return rest; })());
            }}
          />
        ) : (
          <input
            type="text"
            value={String(bodyFormVals[p.name] ?? '')}
            onChange={(e) => setBodyFormVals((prev) => ({ ...prev, [p.name]: e.target.value }))}
          />
        )}
      </div>
    ))}
  </div>
)}
```

`bodyFormVals` state widens to `Record<string, string | File>`. Build `inputs.body` from it directly — runner already handles File.

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter web test
git add apps/web/src/ui/RunPanel.tsx apps/web/tests/ui/RunPanel.bodyType.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): RunPanel renders file picker for multipart file fields

Each bodyForm row whose type.kind === 'file' (and bodyContentType is
multipart) renders <input type="file"> instead of a text input; the
selected File goes into bodyFormVals as-is and the runner appends it
to FormData.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Codegen — real FormData for multipart (replace throw placeholder)

**Files:**
- Modify: `packages/cli/src/generate/client.ts` — replace the v1 multipart throw with FormData generation.
- Modify: `packages/cli/tests/generate/client.test.ts` — multipart-with-file test.

- [ ] **Step 1: Failing test**

```ts
test('multipart endpoint with file field generates FormData (no throw placeholder)', () => {
  const out = generateClient(specWithMultipartUpload);
  expect(out).not.toContain('multipart bodies not yet supported');
  expect(out).toContain('const fd = new FormData();');
  expect(out).toContain("fd.append(\"file\", input.body[\"file\"], (input.body[\"file\"] as File).name);");
  expect(out).toContain('body: fd,');
});
```

- [ ] **Step 2: Implement the multipart codegen branch**

Replace the throw placeholder in `buildFetchOptsExpr`:

```ts
if (ct === 'multipart' && endpoint.bodyForm && endpoint.bodyForm.length > 0) {
  const fdLines = endpoint.bodyForm.map((p) => {
    const access = `input.body[${JSON.stringify(p.name)}]`;
    const append = p.type.kind === 'file'
      ? `fd.append(${JSON.stringify(p.name)}, ${access}, (${access} as File).name);`
      : `fd.append(${JSON.stringify(p.name)}, String(${access}));`;
    return p.required ? append : `if (${access} !== undefined) ${append}`;
  }).join('\n          ');
  return `(() => { const fd = new FormData(); ${fdLines.replace(/\n/g, ' ')} return fd; })()`;
}
```

(Or emit the FormData construction as inline `IIFE` to keep `buildFetchOptsExpr` returning a single expression. Tests assert the shape of the emitted code.)

The header for multipart endpoints stays `headers: await baseHeaders()` (no Content-Type — fetch handles boundary).

`tsRefType` for `'file'` returns `'File'`:

```ts
case 'file': return 'File';
```

- [ ] **Step 3: Validator integration**

At the top of `generateClient` (and `generateTs`/`generateZod`), call `findIllegalFileTypes(spec)` and throw if non-empty:

```ts
const fileErrs = findIllegalFileTypes(spec);
if (fileErrs.length > 0) {
  throw new Error('Codegen aborted — illegal file type placements:\n' + fileErrs.map(e => `  • ${e.where}: ${e.message}`).join('\n'));
}
```

- [ ] **Step 4: Tests pass + commit**

```bash
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
git add packages/cli/src/generate/client.ts packages/cli/tests/generate/client.test.ts
git commit -m "$(cat <<'EOF'
feat(cli/codegen): real multipart FormData generation with File support

Removes the v1 runtime throw placeholder. Multipart endpoints now emit
a typed client method that builds FormData, including file-field
handling via File. The validator runs at codegen entry and aborts on
illegal file-type placements.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: OpenAPI exporter / importer round-trip for file fields

**Files:**
- Modify: `packages/core/src/exporters/openapi.ts` — file ↔ binary mapping.
- Modify: `apps/web/src/importers/openapi.ts` (or wherever the importer lives) — same.
- Modify: existing OpenAPI tests + add round-trip for file.

- [ ] **Step 1: Failing test**

```ts
test('file field round-trips through OpenAPI', () => {
  const spec = { ...emptySpec(), endpoints: [{
    id: 'upload', method: 'POST', path: '/upload', tags: [],
    pathParams: [], queryParams: [], headers: [],
    requestBody: null, bodyContentType: 'multipart',
    bodyForm: [{ name: 'file', required: true, type: { kind: 'file' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  }] };
  const oapi = toOpenApi(spec);
  const back = fromOpenApi(oapi).spec;
  expect(back.endpoints[0]!.bodyContentType).toBe('multipart');
  expect(back.endpoints[0]!.bodyForm![0]!.type).toEqual({ kind: 'file' });
});
```

- [ ] **Step 2: Map FileType ↔ binary**

In the exporter's `typeDefToOpenApi` or equivalent: `case 'file': return { type: 'string', format: 'binary' };` Same for the importer reading a schema with `format: 'binary'` → `{ kind: 'file' }`. Only allowed inside a multipart `requestBody.content['multipart/form-data'].schema.properties` — outside that context, the importer rejects with a warning (matches the urlencoded $ref handling pattern from v1).

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @zwaggen/core test
git add packages/core/src/exporters/openapi.ts apps/web/src/importers/openapi.ts packages/core/tests/exporters/openapi.test.ts
git commit -m "$(cat <<'EOF'
feat(core/openapi): round-trip file fields as type:string format:binary

Multipart bodyForm file fields export to OpenAPI's binary string format
and import back to FileType. Importer rejects binary format outside
multipart context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Tick TODO + log v1.2 follow-up + move spec/plan + final sweep

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Final sweep**

```bash
pnpm install
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/core lint
pnpm --filter @zwaggen/core build
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter @zwaggen/desktop build
pnpm --filter @zwaggen/desktop test
pnpm --filter @zwaggen/desktop e2e
```

All green.

- [ ] **Step 2: Tick TODO + log v1.2 follow-up**

Find the body-ux v1.1 entry (added when v1 shipped) and tick it:

```
- [x] Body UX v1.1 — file uploads. Add `'file'` TypeDef kind, file picker UI in RunPanel for multipart endpoints, codegen handles FormData with File, IPC bytes within 50MB/file + 100MB/total caps. See `docs/plans/done/2026-04-23-body-ux-files.md`.
```

Add a new follow-up:

```
- [ ] Body UX v1.2 — streamed/large file uploads + multi-file fields (`<input multiple>`). Lifts the 50MB IPC cap via temp-file paths or chunked streaming.
```

Update "Last updated" stamp.

- [ ] **Step 3: Move spec + plan to done/**

```bash
git mv docs/specs/active/2026-04-23-body-ux-files.md docs/specs/done/
git mv docs/plans/active/2026-04-23-body-ux-files.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship body-ux-files (v1.1) — move spec+plan to done

Body UX v1.2 (streaming + multi-file) follow-up logged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 9 tasks ticked.
- Schema at v6; v5 → v6 stamp migration ships.
- Validator rejects file kind outside multipart bodyForm; runs at codegen + export.
- Runner appends File/Blob to FormData.
- Desktop IPC: 50MB/file + 100MB/total caps; bytes serialized via Uint8Array.
- Bootstrap adapter walks FormData; arrayBuffer() per file; throws on cap.
- TypeBuilder + ParamTable expose File kind only in multipart bodyForm context.
- RunPanel renders `<input type="file">` for file fields.
- Codegen emits real FormData (no more throw placeholder) including File handling.
- OpenAPI round-trip works.
- All cross-package tests green.
- Branch `plan/body-ux-files` ready to push (PR base = `main`).
