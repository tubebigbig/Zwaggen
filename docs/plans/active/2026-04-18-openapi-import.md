# OpenAPI 3.1 import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Open existing OpenAPI 3.1 JSON docs in Zwaggen via a new Import button. Best-effort lossy conversion with a warning banner.

**Spec:** `docs/specs/active/2026-04-18-openapi-import.md`

**Architecture:** A single pure `fromOpenApi(doc)` returns `{ spec, warnings }`. `AppHeader` adds an Import button that pipes through the existing `pickOpen` / `uploadFile` helpers, parses JSON, calls `fromOpenApi`, and dispatches `replaceSpec(spec, null)` + `setImportWarnings(warnings)`. A small banner renders the warnings.

**Tech Stack:** existing only — no YAML, no external OpenAPI parser.

---

## Rules Applied

`spec-versioning.md` — the imported spec is stamped with `CURRENT_SCHEMA_VERSION`. `validator-cycles.md` — recursive schema conversion uses a `Set<string>` for visited `$ref` names to avoid infinite loops on self-referential schemas.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/importers/openapi.ts` | `fromOpenApi(doc)` pure converter |
| Modify | `apps/web/src/ui/AppHeader.tsx` | Import button + banner + warnings state |
| Modify | `apps/web/src/state/store.ts` | Optional: add `importWarnings` slice (or keep in AppHeader local state) |
| Modify | `apps/web/src/i18n/locales/en.json` + `zh-TW.json` | Import-related keys |
| Create | `apps/web/tests/importers/openapi.test.ts` | Mapping coverage + round-trip sanity |
| Create | `apps/web/tests/ui/AppHeader.importOpenApi.test.tsx` | Import flow + banner |

---

## Tasks

### Task 1: Primitive + container schema conversion

**Files:** `importers/openapi.ts` (new), `importers/openapi.test.ts` (new)

Scope: primitive types, arrays, objects, refs, literals. No unions yet.

- [ ] Create `apps/web/src/importers/openapi.ts` with just:
  ```ts
  export interface ImportResult { spec: Spec; warnings: string[] }
  export function fromOpenApi(doc: unknown): ImportResult { … }
  // plus readSchema(schema, warnings, path, visitedRefs)
  ```
- [ ] Implement `readSchema` for:
  - `type: 'string' | 'number' | 'integer' | 'boolean' | 'null'` with relevant constraints.
  - `const:` → `LiteralType`.
  - `type: 'array'` with `items` → `ArrayType` (recurse on `items`).
  - `type: 'object'` with `properties` / `required` → `ObjectType` (recurse on each property).
  - `$ref: '#/components/schemas/Foo'` → `{ kind: 'ref', ref: 'Foo' }`.
  - External `$ref` → push warning, fallback to `{ kind: 'string' }` or `{ kind: 'null' }` — pick one, document.
- [ ] Implement top-level `fromOpenApi`:
  - Bail with a warning if `doc` is not an object.
  - Iterate `components.schemas` → build `spec.types`.
  - Build an empty `spec` with defaults (`schemaVersion`, `environments: { default: { variables: [] } }`, `activeEnvironment: 'default'`, `auth: { type: 'none' }`, `useProxyDefault: false`, `endpoints: []`).
  - Copy `info.title` → `spec.info.name`, version, description.
  - `servers[0].url` → `spec.info.baseUrl`.
- [ ] Tests:
  - Each mapping-table row for primitives, `const`, array, object, `$ref`.
  - Round-trip: take a tiny Zwaggen spec with one object type, `toOpenApi`, `fromOpenApi`, assert `Object.keys(types)` matches.
  - Missing `components.schemas` → empty types, no throw.
  - Non-object `doc` → single warning, empty spec returned.
- [ ] Commit: `feat(importers): OpenAPI 3.1 primitive + container schema conversion`.

### Task 2: Unions + edge cases

**Files:** same importer + test files.

- [ ] Extend `readSchema`:
  - `oneOf: [...]` → `UnionType` with recursed variants.
  - `anyOf: [...]` → `UnionType` with a warning (`anyOf treated as union`).
  - `allOf: [A, B]` where all are objects → merged `ObjectType` (union of fields, union of required). Non-object `allOf` member → warning + skip.
  - `type: ['string', 'null']` → `UnionType` with the two primitive variants.
  - `nullable: true` (3.0 hold-over) → wrap in union with null + warning.
  - `description` passed through.
  - `example` on object/array → `example` field.
- [ ] Tests for each.
- [ ] Commit: `feat(importers): OpenAPI unions + nullable/allOf edge cases`.

### Task 3: Paths → endpoints

**Files:** importer + tests.

- [ ] Implement path iteration:
  - For each `paths[path][method]` (only standard HTTP methods):
    - Method uppercased.
    - `description` = `summary` || `description`.
    - `parameters[]`: split by `in` into pathParams/queryParams/headers.
    - `requestBody.content['application/json'].schema` → `TypeDef`; other content types → warning + `requestBody: null`.
    - `responses`: for each status key, extract `.content['application/json'].schema` (skip if none). `default` → status `0` + warning.
    - `tags` preserved.
    - `auth: 'inherit'`, `useProxy: 'inherit'`.
- [ ] Tests:
  - Minimal doc with one POST endpoint, one response schema, tags.
  - Non-JSON request body content type → warning.
  - Multiple responses with different status codes.
  - `default` response.
  - Path and query params split correctly.
- [ ] Commit: `feat(importers): OpenAPI paths → endpoints`.

### Task 4: AppHeader Import button

**Files:** `AppHeader.tsx`, `AppHeader.importOpenApi.test.tsx` (new), locale files.

- [ ] Read `AppHeader.tsx`.
- [ ] Add an `importOpenApi` handler mirroring `openSpec` for file selection:
  - Use `pickOpen` (FSA) or `uploadFile` fallback to get text.
  - `JSON.parse` with an alert on failure.
  - Call `fromOpenApi`.
  - `replaceSpec(spec, null)`.
  - Store warnings in local state `const [importWarnings, setImportWarnings] = useState<string[] | null>(null)`.
- [ ] Add an "Import OpenAPI" button next to "Open". Use an icon (pick an existing icon or add `IconUpload`).
- [ ] Render a warnings banner below the header bar when `importWarnings?.length`:
  ```tsx
  {importWarnings && importWarnings.length > 0 && (
    <div role="alert" className="...">
      <strong>{t('importWarnings', { count: importWarnings.length })}</strong>
      <ul>{importWarnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}</ul>
      {importWarnings.length > 5 && <div>+{importWarnings.length - 5} more</div>}
      <button onClick={() => setImportWarnings(null)}>{t('dismiss')}</button>
    </div>
  )}
  ```
- [ ] i18n keys:
  - en: `"importOpenApi": "Import OpenAPI"`, `"importBadJson": "Could not parse file — expected JSON."`, `"importWarnings": "{{count}} warning(s) during import"`, `"dismiss": "Dismiss"`
  - zh-TW: `"importOpenApi": "匯入 OpenAPI"`, `"importBadJson": "無法解析檔案 — 需要 JSON 格式。"`, `"importWarnings": "匯入時有 {{count}} 則警告"`, `"dismiss": "關閉"`
- [ ] Tests:
  - Stub `pickOpen` / `readFile` (or `uploadFile`) to return a canned OpenAPI JSON string. Click Import. Assert `useSpecStore.getState().spec.types` contains the expected named type.
  - Canned doc that triggers a warning (e.g., anyOf). Assert the banner renders with the warning text.
  - Click Dismiss → banner gone.
- [ ] Commit: `feat(web): Import OpenAPI action in AppHeader + warning banner`.

### Task 5: E2E + docs move

- [ ] `pnpm e2e` green. If a new button changes a selector, fix minimally.
- [ ] `git mv` spec + plan to done/. Commit.

---

## Open Questions

1. Fallback TypeDef for external `$ref`: `{ kind: 'string', description: 'unsupported external ref: ...' }` (pragmatic) or omit the field with a warning (clean)? Decide during Task 1 — document the choice in the PR description.
2. Should the warnings banner persist across navigation? **Decision**: session-local, dismissed by user or by the next import.
