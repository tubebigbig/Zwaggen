# OpenAPI 3.1 import — open existing Swagger specs in Zwaggen

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — new `importers/openapi.ts` + `AppHeader` + `storage/file`

## Problem

Zwaggen's canonical JSON is the only format it reads back. That's great for the round-trip story but terrible for adoption: a team with a 500-line Swagger spec can't open it without hand-rewriting the whole thing. Every other export-centric tool (Postman, Insomnia) offers an Import. Not having one is the single biggest reason Zwaggen gets bounced after the five-minute look.

The exporter side is clean; the inverse (importer) is the same problem in reverse: map OpenAPI `schemas` → Zwaggen `types`, `paths[].operation` → `endpoints`, `servers[0].url` → `info.baseUrl`.

## Goal

Add an "Import OpenAPI" action to `AppHeader` that opens a file picker, parses an OpenAPI 3.1 document, converts it to a Zwaggen `Spec`, and calls `replaceSpec`. Best-effort lossy import — unsupported features emit a warning banner but don't fail the import.

## Non-goals

- **Not OpenAPI 2.0 / Swagger 2** (no `definitions`, `host`, `basePath`, etc.). OpenAPI 3.1 only. 3.0 → 3.1 conversion is a separate problem; we may support 3.0 later, but MVP is 3.1.
- **Not round-tripping.** Zwaggen's richer builder state (e.g., per-env secrets, history, UI prefs) cannot come out of an OpenAPI file. Import is a one-way seed; after import the user works in Zwaggen's canonical JSON.
- **Not full schema coverage.** `allOf`, `anyOf` (beyond simple union), `not`, `discriminator`, polymorphism, `readOnly`/`writeOnly`, content types other than `application/json`, XML, external `$ref` files — all skipped with a warning.
- **Not authentication import.** `securitySchemes` → auth preset is a follow-up. For MVP, auth defaults to `none` after import; the user sets it manually.
- **Not overwrite-guard UX beyond the standard dirty confirm.** Existing unsaved-work guard is enough.
- **Not YAML.** JSON only for MVP (paste/upload `.json`). YAML support can come once a parser is on the dep list — not worth it for MVP.

## Requirements

1. Button in `AppHeader`: "Import OpenAPI". Opens a native file picker restricted to `.json`. File System Access API used when available; upload fallback otherwise (mirrors `openSpec`).
2. Pure `fromOpenApi(doc: unknown): { spec: Spec; warnings: string[] }`. No I/O. Returns a spec PLUS a warning list.
3. **Schemas → types**: for each key in `components.schemas`, convert to a `TypeDef` via the mapping table below. Named types become entries in `spec.types`.
4. **Paths → endpoints**: for each `paths[path][method]`, produce an `Endpoint`:
   - `method`: upper-case.
   - `path`: as-is (OpenAPI uses `{param}` templating, same as Zwaggen).
   - `description`: from operation `summary` (preferred) or `description`.
   - `pathParams`, `queryParams`, `headers`: from `parameters[]` by `in:` value. `required`, `description`, `type` mapped from `schema`.
   - `requestBody`: from `requestBody.content["application/json"].schema` if present, else `null`. Non-JSON content types emit a warning.
   - `responses`: one `ResponseDef` per `(status, responses[status].content["application/json"].schema)` pair. `default` status mapped to `0` and flagged with a warning.
   - `tags`: from operation `tags[]` (already matches Zwaggen's model).
   - `auth`: `'inherit'`. `useProxy`: `'inherit'`.
5. **Info**: `spec.info.name` = `info.title`, `version` = `info.version`, `description` = `info.description`, `baseUrl` = `servers[0].url` if present.
6. **Warnings** surfaced in the UI as a dismissable banner after import. Non-blocking.
7. The generated `Spec.schemaVersion` is the current version. Environments default to `{ default: { variables: [] } }`, `activeEnvironment: 'default'`, `auth: { type: 'none' }`, `useProxyDefault: false`.

## Schema mapping table

| OpenAPI | Zwaggen `TypeDef` | Notes |
|---|---|---|
| `type: "string"` | `{ kind: 'string' }` | plus `minLength`, `maxLength`, `pattern`, `enum` when present |
| `type: "number"` | `{ kind: 'number' }` | plus `minimum` → `min`, `maximum` → `max`, `enum` |
| `type: "integer"` | `{ kind: 'integer' }` | same bounds |
| `type: "boolean"` | `{ kind: 'boolean' }` | |
| `type: "null"` | `{ kind: 'null' }` | 3.1 allows this directly |
| `const: X` | `{ kind: 'literal', value: X }` | |
| `type: "array"` | `{ kind: 'array', element }` | `items` → element; `minItems`, `maxItems` preserved |
| `type: "object"` | `{ kind: 'object', fields }` | `properties` → `fields`, `required[]` → per-field `required`; `additionalProperties: false` → `strict: true` |
| `$ref: "#/components/schemas/Foo"` | `{ kind: 'ref', ref: 'Foo' }` | Other `$ref` shapes (external, non-components) skipped with warning |
| `oneOf: [...]` | `{ kind: 'union', variants }` | plain union. `discriminator` ignored. |
| `anyOf: [...]` | `{ kind: 'union', variants }` | treated as union (approximation) with a warning. |
| `allOf: [A, B]` | best-effort merge of object shapes; if any non-object, skip with warning | |
| `description` | passed through on each variant | |
| `example` | on `object`/`array` → `example`; on primitives → ignored (no home in Zwaggen) | |
| `nullable: true` (3.0) | `{ kind: 'union', variants: [T, { kind: 'null' }] }` with warning | 3.0 hold-over; in 3.1 should be `type: [..., 'null']` |
| `type: ["string", "null"]` | `{ kind: 'union', variants: [string, null] }` | 3.1 multi-type |

Unsupported shapes produce one warning each, e.g., `Skipped /users POST requestBody (content-type application/xml is not supported)`.

## Design

### Importer — `apps/web/src/importers/openapi.ts` (new)

Single-file module. Pure. No dependencies beyond what's already in the project.

```ts
import {
  CURRENT_SCHEMA_VERSION,
  type Spec, type TypeDef, type Endpoint,
  type ResponseDef, type ParamDef,
} from '../schema/types';

export interface ImportResult {
  spec: Spec;
  warnings: string[];
}

export function fromOpenApi(doc: unknown): ImportResult;
```

Internal helpers:
- `readSchema(schema, warnings, path): TypeDef` — the recursive schema → `TypeDef` converter.
- `readParam(p, warnings): ParamDef`.
- `readResponses(responses, warnings, path): ResponseDef[]`.

The `warnings` array is threaded through for append.

Defensive reading: everything via optional chaining + `typeof` checks. Never throw on missing fields; emit a warning and continue. Only throw on `doc` not being an object.

**Special case — `fromOpenApi` called on Zwaggen's own export:** an earlier Zwaggen OpenAPI export that had been committed and re-imported should round-trip the visible subset cleanly (types with the same name, paths with the same methods, response status codes matching). Exact structural equality is not required — the importer is lossy — but a sample Zwaggen-exported spec fed back in should yield a `Spec` whose `types` keys match and whose endpoints have the same method+path tuples.

### Storage layer — `apps/web/src/storage/file.ts`

No new function required. The existing `pickOpen` / `uploadFile` pair already returns `{ text }`. The importer runs on the parsed JSON.

If you want to restrict the picker to JSON, extend `pickOpen` to accept a MIME filter. Simpler: reuse as-is — OpenAPI files are JSON files.

### UI — `apps/web/src/ui/AppHeader.tsx`

Add an "Import" menu item (or a separate button next to Open). Flow:

```ts
async function importOpenApi() {
  const text = supportsFileSystemAccess()
    ? (await readFile(await pickOpen())).text
    : (await uploadFile())?.text;
  if (!text) return;
  let doc: unknown;
  try { doc = JSON.parse(text); }
  catch { alert(t('importBadJson')); return; }
  const { spec, warnings } = fromOpenApi(doc);
  await replaceSpec(spec, null); // no file handle — imports are "fresh" specs
  setImportWarnings(warnings);   // drive a banner in the header
}
```

A small banner component surfaces `warnings` below the header: one row per warning, capped at ~5 visible with "+N more" expander. Dismiss button clears.

Alternative: render the banner via a shared UI element (toast rack) if one exists. Look at existing alert patterns in the code; otherwise inline inside `AppHeader`.

### Tests

**Unit — `apps/web/tests/importers/openapi.test.ts` (new)**

For each mapping-table row, a small fixture with the OpenAPI fragment → assert the resulting `TypeDef`. Examples:
- `{ type: 'string', minLength: 3 }` → `{ kind: 'string', minLength: 3 }`.
- `{ $ref: '#/components/schemas/User' }` → `{ kind: 'ref', ref: 'User' }`.
- `{ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }` → object with one `required: true` field.
- `{ oneOf: [{ type: 'string' }, { type: 'integer' }] }` → union of two variants.
- `{ $ref: 'https://example.com/schema.json' }` → warning "Skipped external $ref", ref becomes a placeholder (or omits the field — pick one; document).

Also path/endpoint cases:
- Full minimal doc with `info`, `paths`, `components.schemas` → produces a valid `Spec`.
- Doc with no `servers[]` → `info.baseUrl` is undefined.
- Operation with `tags: ['users']` → endpoint's `tags: ['users']`.
- Operation with `parameters[{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }]` → `pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }]`.

Round-trip sanity:
- Take an existing Zwaggen spec, run `toOpenApi`, then `fromOpenApi`. Assert the re-imported spec's `Object.keys(types)` equals the original, and the endpoint method+path tuples match (exact inner TypeDefs may differ — documented lossy).

**Component — `AppHeader.importOpenApi.test.tsx`**

- Stub file picker to return a canned OpenAPI doc. Click Import. Assert `useSpecStore.getState().spec.types` has the expected keys.
- Warnings flow: seed a doc that triggers a warning (e.g., `oneOf` with `discriminator`). Click Import. Assert the warning banner renders with the warning text.
- Banner dismiss button clears warnings.

## Error handling

- **Invalid JSON file**: alert with `t('importBadJson')`, no store change.
- **Not an OpenAPI 3.1 document** (missing `openapi: "3.1.x"`): emit a warning but still try to parse — lenient by default. If that turns out to be too lenient in practice, tighten later.
- **Totally empty doc**: result is an empty spec with one warning.

## Open questions

1. Should imported specs auto-save to a new file on disk or stay in-memory until the user clicks Save? **Decision**: in-memory (no file handle), matches what `replaceSpec(spec, null)` already does for the upload fallback.
2. Support YAML? **Decision**: deferred — adds a dep and the 90% use case copies JSON around.
3. Should we silently drop unsupported shapes or fail import? **Decision**: silent drop + warning. Import must succeed for any valid 3.1 doc, even if unsupported features lose fidelity.
