# Spec — Body UX v1.1: file uploads in multipart bodies

## Problem

Body UX v1 shipped end-to-end multipart support — but only for text fields. Real-world `multipart/form-data` exists primarily to upload files (avatars, attachments, CSV imports). Today there's no way to express a file field in the spec, no way to pick a file in the runner, and no way for the desktop transport to ferry a `File` across IPC.

This is a focused v1.1: add the missing piece (`'file'` TypeDef kind), wire it through every layer (schema → runner → desktop IPC → UI → codegen → OpenAPI). Browser playground gets file picker via `<input type="file">`; desktop sends file bytes over IPC and reconstructs `FormData` in the main process.

## Success criteria

- New `FileType { kind: 'file'; description?: string }` member of `TypeDef`. Schema bumps v5 → v6 with a no-op migration (existing specs have no `'file'` types so the migrator just stamps).
- The `'file'` kind is **only valid inside `bodyForm` ParamDefs of multipart endpoints**. Validation surfaces a clear error if it appears anywhere else (e.g. inside `bodyForm` of a urlencoded endpoint, or inside `requestBody`/`responses`/regular `types`). The validator runs at codegen and at OpenAPI export time.
- **Runner** (`@zwaggen/core/runner/send.ts`): the multipart branch in `buildRequest` accepts `File | Blob` values and appends them with their filename to `FormData`:
  ```ts
  if (v instanceof File) fd.append(k, v, v.name);
  else if (v instanceof Blob) fd.append(k, v);
  else fd.append(k, sub(String(v)));
  ```
- **Desktop IPC**: `multipartFields` payload extends to carry file bytes. New shape:
  ```ts
  type MultipartField =
    | [string, string]                                // text field
    | [string, { kind: 'file'; name: string; type: string; bytes: Uint8Array }];
  ```
  Renderer-side `bootstrap.ts` adapter walks the `FormData`, awaits `arrayBuffer()` on each `File`, packages the bytes. Main side reconstructs a `File`/`Blob` per field and appends to `FormData` before fetch. **50MB per-file soft limit**: bytes larger than 50MB throw `Error('File too large for IPC: <size>MB. Max 50MB in v1.1; streaming lands in v1.2.')` BEFORE invoking IPC. Total request size soft cap of 100MB across all fields (best-effort; exceeds → same error).
- **EndpointEditor UI**: `TypeBuilder` (or the inline type editor used in `ParamTable`) exposes "File" as a top-level type kind alongside string/number/boolean. Only enabled when the parent context is a multipart `bodyForm` ParamDef row — disabled with a tooltip elsewhere.
- **RunPanel UI**: for a multipart endpoint's `bodyForm` field of type `'file'`, render an `<input type="file">` instead of a text input. The selected `File` lives in component state alongside the text-typed values; the runner receives a `Record<string, string | File>` for `inputs.body`. UI shows the picked file's name + size.
- **Codegen** (`@zwaggen/cli` `generate ts`): multipart endpoints with file fields generate proper code that builds `FormData`. The placeholder runtime throw from v1 is removed:
  ```ts
  // Generated client method body for a multipart endpoint:
  async upload(input: { file: File; description?: string }): Promise<R> {
    const fd = new FormData();
    fd.append('file', input.file, (input.file as File).name);
    if (input.description !== undefined) fd.append('description', input.description);
    const r = await f(`${opts.baseUrl}/upload`, {
      method: 'POST',
      headers: await baseHeaders(),  // Content-Type set by fetch with boundary
      body: fd,
    });
    if (!r.ok) throw new ZwaggenHttpError(r);
    return RSchema.parse(await r.json());
  }
  ```
  The `input` type for file fields is `File` (browser) — universal-runtime note in the codegen header explains: in Node 20+ the global `File` exists; in Bun/Deno same; in older Node use a `node-fetch` polyfill if needed.
- **OpenAPI exporter / importer**: `FileType` ↔ `{ type: 'string', format: 'binary' }` per OpenAPI 3 spec. Round-trip lossless.
- New tests:
  - `buildRequest` multipart: file field produces FormData with the file appended; non-file fields still work.
  - Desktop IPC: `handleHttp` accepts the new `multipartFields` shape with file entries; reconstructs FormData with the right filenames; reject on >50MB.
  - Bootstrap adapter: `FormData` with `File` values gets serialized via `arrayBuffer()` to bytes.
  - RunPanel: a multipart endpoint with a file field renders `<input type="file">` and sends the selected file via the runner.
  - EndpointEditor: TypeBuilder offers "File" only for multipart bodyForm.
  - Validator: file kind rejected outside multipart bodyForm.
  - Codegen: multipart-with-file generates working FormData code (no throw placeholder).
  - OpenAPI: file-field round-trip via export → import.
- All existing tests pass (v5 specs continue to work; the v6 migration is a no-op stamp).
- TODO entry "Body UX v1.1 — file uploads" ticked.

## Out of scope

- **Multiple files per field** (HTML's `<input type="file" multiple>`). Single-file per field in v1.1; arrays of files land in v1.2 alongside streaming.
- **Streamed uploads** (chunked / resumable). The 50MB IPC limit is a hard cap for v1.1. Anything bigger needs streaming via `IpcMain.handle` + `MessageChannel` or temp-file paths.
- **Drag-drop file picker** in RunPanel. The browser `<input type="file">` is fine for v1.1; drag-drop UX is its own polish.
- **Server-Sent Events / WebSockets / gRPC** — separate transport features.
- **Response-side multipart parsing**.
- **Response file downloads** (`Content-Disposition: attachment`). The runtime parses everything as text/JSON today; binary response handling is out.
- **Codegen: typed bodies for binary uploads using `Blob` vs `File`.** The generated typed client uses `File` (the more specific type); users can pass any `Blob` since `File extends Blob`.
- **`x-*` extension preservation** on file ParamDefs (covered by separate TODO).
- **Versioning the schema beyond v6.** v6 only adds the new TypeDef variant; migration is a no-op stamp.
- **Removing `requestBody` for multipart endpoints** — that field is already null when `bodyContentType === 'multipart'` per v1 design.

## Approach

### Schema (v6)

`packages/core/src/schema/types.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 6 as const;

export interface FileType {
  kind: 'file';
  description?: string;
  /** Optional MIME type filter for the picker (`accept` attribute), e.g. 'image/*'. */
  accept?: string;
  /** Maximum file size in bytes the picker should warn at. Soft limit; runner enforces a hard 50MB cap regardless. */
  maxBytes?: number;
}

export type TypeDef =
  | StringType | NumberType | IntegerType | BooleanType | NullType
  | LiteralType | ArrayType | ObjectType | UnionType | RefType
  | FileType;
```

Migration v5 → v6 in `migrations.ts`: identical no-op pattern as v4 → v5.

Snapshot v5 type in `packages/core/src/schema/versions/v5.ts`.

### Validator

New tiny module `packages/core/src/schema/validateFileType.ts` (or extend an existing validator) that walks a Spec and verifies:

```ts
function findIllegalFileTypes(spec: Spec): Array<{ where: string; message: string }> {
  const errors: Array<{ where: string; message: string }> = [];
  // FileType is only valid inside endpoint.bodyForm[*].type when bodyContentType === 'multipart'.
  for (const [name, def] of Object.entries(spec.types)) {
    if (containsFileType(def)) errors.push({ where: `types.${name}`, message: 'file type not allowed in named types (only in multipart bodyForm)' });
  }
  for (const ep of spec.endpoints) {
    if (ep.requestBody && containsFileType(ep.requestBody)) errors.push({ where: `endpoints.${ep.id}.requestBody`, message: '...' });
    for (const r of ep.responses) {
      if (containsFileType(r.type)) errors.push({ where: `endpoints.${ep.id}.responses[${r.status}]`, message: '...' });
    }
    if (ep.bodyContentType !== 'multipart' && ep.bodyForm) {
      for (const p of ep.bodyForm) {
        if (containsFileType(p.type)) errors.push({ where: `endpoints.${ep.id}.bodyForm.${p.name}`, message: 'file type only valid for multipart endpoints' });
      }
    }
  }
  return errors;
}
```

Codegen calls this at the top of `generateClient` (and `generateTs`/`generateZod` for symmetry); throws on the first error with all collected messages. OpenAPI exporter calls it before serialization. The runner does NOT — it trusts the spec is valid (faster path).

### Runner

`packages/core/src/runner/send.ts` multipart branch becomes:

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

Empty/undefined file fields are skipped (matches text behaviour).

### Desktop IPC

`apps/desktop/electron/ipc.ts` extends `MultipartField` and `handleHttp`:

```ts
const FILE_LIMIT = 50 * 1024 * 1024;
const TOTAL_LIMIT = 100 * 1024 * 1024;

type MultipartField =
  | [string, string]
  | [string, { kind: 'file'; name: string; type: string; bytes: Uint8Array }];

export function isMultipartField(v: unknown): v is MultipartField {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'string') return false;
  if (typeof v[1] === 'string') return true;
  const f = v[1] as Record<string, unknown>;
  if (f && f.kind === 'file' && typeof f.name === 'string' && typeof f.type === 'string' && f.bytes instanceof Uint8Array) {
    if (f.bytes.byteLength > FILE_LIMIT) return false;
    return true;
  }
  return false;
}

export async function handleHttp(payload: unknown): Promise<TransportResponse> {
  // ... existing checks ...
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
  // ... rest ...
}
```

`apps/web/src/bootstrap.ts` adapter walks the `FormData` from `req.bodyMultipart`:

```ts
async function buildMultipartFields(fd: FormData): Promise<MultipartField[]> {
  const out: MultipartField[] = [];
  let total = 0;
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') {
      out.push([k, v]);
    } else {
      const bytes = new Uint8Array(await v.arrayBuffer());
      total += bytes.byteLength;
      if (bytes.byteLength > 50 * 1024 * 1024) {
        throw new Error(`File "${v.name}" is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB; max 50MB in v1.1.`);
      }
      if (total > 100 * 1024 * 1024) {
        throw new Error(`Total multipart payload too large; max 100MB in v1.1.`);
      }
      out.push([k, { kind: 'file', name: (v as File).name, type: v.type, bytes }]);
    }
  }
  return out;
}
```

### EndpointEditor / TypeBuilder

In `ParamTable`/`TypeBuilder`, add a "File" option to the type-kind dropdown. Conditionally enable based on context:

- For `bodyForm` ParamDefs of multipart endpoints: enabled.
- For all other ParamDef contexts (path/query/headers, urlencoded bodyForm, requestBody TypeBuilder, named types): hidden or disabled with a "Files only valid for multipart bodies" tooltip.

The cleanest approach: pass a new prop `allowFileType?: boolean` to `ParamTable` and `TypeBuilder`. EndpointEditor passes `allowFileType={ep.bodyContentType === 'multipart'}` for the body-form table only.

When the kind is "File", the editor surfaces optional `accept` and `maxBytes` inputs.

### RunPanel

For a multipart endpoint, iterate `endpoint.bodyForm`. For each field:
- If `type.kind === 'file'`: render `<input type="file" accept={type.accept} onChange={...}>`. Store the selected `File` in a `Record<string, File | string>` keyed alongside text fields. Display "<filename> · <size formatted>".
- Else: existing `ParamInputs` row (text input).

On Run, build `inputs.body` as the merged record of text + file values.

### Codegen

In `packages/cli/src/generate/client.ts`, replace the multipart placeholder throw with a real `FormData` builder. Detect file fields via `bodyForm[*].type.kind === 'file'`:

```ts
function buildMultipartBody(endpoint: Endpoint, spec: Spec): string {
  // returns the body-construction lines as one big string injected into the method body.
  const lines = ['const fd = new FormData();'];
  for (const p of endpoint.bodyForm ?? []) {
    const access = `input.body[${JSON.stringify(p.name)}]`;
    if (p.type.kind === 'file') {
      lines.push(p.required
        ? `fd.append(${JSON.stringify(p.name)}, ${access}, (${access} as File).name);`
        : `if (${access} !== undefined) fd.append(${JSON.stringify(p.name)}, ${access}, (${access} as File).name);`);
    } else {
      lines.push(p.required
        ? `fd.append(${JSON.stringify(p.name)}, String(${access}));`
        : `if (${access} !== undefined) fd.append(${JSON.stringify(p.name)}, String(${access}));`);
    }
  }
  return lines.join('\n        ');
}
```

The input type for file fields in `inputTypeFor` becomes `File`:

```ts
case 'file': return 'File';
```

Header for multipart endpoints: `headers: await baseHeaders()` (no Content-Type — fetch sets it with boundary). The plan's snippet in the spec shows the final emit shape.

### OpenAPI exporter / importer

Exporter: `'file' → { type: 'string', format: 'binary' }`. Importer: spot the format and map back to `{ kind: 'file' }`. Reject ambiguous `format: binary` outside of multipart with the same warning the existing OpenAPI importer uses.

### Tests

Per the success criteria. Tests live in their respective package dirs:
- `packages/core/tests/runner/buildRequest.test.ts` (multipart with File).
- `apps/desktop/electron/__tests__/ipc.test.ts` (multipartFields with file payload, 50MB rejection).
- `apps/web/tests/bootstrap.test.ts` (FormData → MultipartField serialization with File).
- `apps/web/tests/ui/RunPanel.bodyType.test.tsx` (file picker for multipart).
- `apps/web/tests/ui/EndpointEditor.bodyType.test.tsx` (File option enabled only for multipart bodyForm).
- `packages/cli/tests/generate/client.test.ts` (multipart-with-file emits FormData; no throw placeholder).
- `packages/core/tests/exporters/openapi.test.ts` (file ↔ binary round-trip).
- `packages/core/tests/schema/validateFileType.test.ts` (new — illegal placements rejected).

### Risks

- **Universal-runtime `File` constructor**: Node 20+ ships globalThis.File. Older Node lacks it. Document a fallback (`import { File } from 'undici'`) for Node < 20. Codegen header notes this.
- **50MB IPC ceiling**: Electron's IPC structured-clone has practical limits (default ~1GB but slow >100MB; renderer→main copy is sync-ish under the hood). 50MB per file + 100MB total are conservative and easy to revisit.
- **`ParamTable` complexity**: adding the file kind to the type editor, plus the `accept`/`maxBytes` sub-fields, grows that component. Risk of test churn. Keep the existing test fixtures intact; add new tests for the new path.
- **Codegen + Node test environment**: `@zwaggen/cli`'s integration test compiles the generated client with `tsc --strict` and runs it in Node. If the generated code refers to `File`, Node 20 has it; CI runs Node 20 — fine. Add a one-line note in the codegen header.
- **Schema migration backwards compat**: existing v5 specs migrate to v6 by stamping; no `'file'` kinds present yet, so the validator no-ops. New v6 specs with file types fail to parse on v5 readers — acceptable since v6 is forward-only.
- **Non-multipart endpoints with stale file types**: if a user creates a multipart endpoint, adds a file field, then switches `bodyContentType` to urlencoded, the file field becomes invalid. The EndpointEditor should either warn or auto-strip on switch. v1.1 keeps it simple: validator surfaces the error at codegen/export time; EndpointEditor shows a red badge on the row but doesn't auto-strip.
- **Renderer Blob vs File**: HTML `<input type="file">` produces `File` objects (which extend `Blob`). Runner accepts both for forward-compat (e.g. drag-drop blob).

## Done definition

- Schema at v6 with FileType in the union; v5 → v6 migration ships.
- Runner multipart branch handles File/Blob.
- Desktop IPC handles file bytes via the extended MultipartField shape with size limits.
- Bootstrap adapter serializes File via `arrayBuffer()` and enforces the limits before IPC.
- TypeBuilder/ParamTable expose File as a kind, conditionally on multipart bodyForm context.
- RunPanel renders `<input type="file">` for file fields.
- Codegen multipart placeholder REPLACED with real FormData generation including file handling.
- OpenAPI export/import round-trips file fields.
- Validator rejects illegal placements at codegen + export time.
- Tests across all layers green; existing tests untouched.
- TODO ticked, follow-up "Body UX v1.2 — streamed/large file uploads + multi-file fields" added.
- Spec + plan moved to `done/`.
- Branch `plan/body-ux-files` pushed (PR base = `main`).
