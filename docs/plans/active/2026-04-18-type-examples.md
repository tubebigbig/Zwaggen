# Type examples — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optional `example?: unknown` on object and array types. Surfaced as a JSON textarea in `TypeBuilder`, used by a "Seed from example" button in `RunPanel`, emitted by OpenAPI and Markdown exporters.

**Spec:** `docs/specs/active/2026-04-18-type-examples.md`

**Architecture:** Additive optional field on two `TypeDef` variants. Single shared resolver `resolveExample(spec, type)` walks `ref` chains safely. Three consumers (RunPanel, OpenAPI, Markdown) use it. No schema bump.

**Tech Stack:** existing only.

---

## Rules Applied

`docs/rules/spec-versioning.md` — optional field addition, no bump. `docs/rules/validator-cycles.md` — `resolveExample` is cycle-safe by `Set<string>` tracking of visited ref names.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/schema/types.ts` | Add `example?: unknown` to `ObjectType` and `ArrayType` |
| Create | `apps/web/src/schema/resolveExample.ts` | Cycle-safe resolver through `ref` chains |
| Modify | `apps/web/src/ui/TypeBuilder.tsx` | Example textarea for object/array kinds |
| Modify | `apps/web/src/ui/RunPanel.tsx` | Seed button + handler |
| Modify | `apps/web/src/exporters/openapi.ts` | Emit `example` on schema |
| Modify | `apps/web/src/exporters/markdown.ts` | `#### Example` section under each named type |
| Modify | `apps/web/src/i18n/locales/en.json` + `zh-TW.json` | `example`, `seedFromExample`, `invalidJson` keys |
| Modify | `apps/web/tests/schema/serialize.test.ts` | Round-trip coverage |
| Create | `apps/web/tests/schema/resolveExample.test.ts` | Resolver unit tests |
| Create | `apps/web/tests/ui/TypeBuilder.example.test.tsx` | Editor tests |
| Modify or create | `apps/web/tests/ui/RunPanel.seed.test.tsx` | Seed button tests |
| Modify | `apps/web/tests/exporters/openapi.test.ts` | Example emission |
| Modify | `apps/web/tests/exporters/markdown.test.ts` | Example section emission |

---

## Tasks

### Task 1: Schema field + resolver

**Files:** `types.ts`, `resolveExample.ts` (new), `serialize.test.ts`, `resolveExample.test.ts` (new)

- [ ] Add `example?: unknown` to `ObjectType` and `ArrayType` only.
- [ ] Create `resolveExample(spec, t)` in `apps/web/src/schema/resolveExample.ts`:
  - Walk `ref` chain via `spec.types`.
  - Track visited names in a `Set<string>` for cycle safety.
  - Return the `example` on the first concrete `object`/`array` node, or `undefined` otherwise.
- [ ] Round-trip tests: type with example persists through toJSON/fromJSON; type without example has no `"example"` key in JSON.
- [ ] Resolver tests: direct object, direct array, primitive returns undefined, single-step ref, multi-step ref chain, cycle returns undefined, missing ref target returns undefined.
- [ ] Run schema tests + full suite.
- [ ] Commit: `feat(schema): optional example field on object/array types + cycle-safe resolver`.

### Task 2: TypeBuilder example editor

**Files:** `TypeBuilder.tsx`, `en.json`, `zh-TW.json`, `TypeBuilder.example.test.tsx` (new)

- [ ] Read `TypeBuilder.tsx` to locate where `object` and `array` branches render their type-specific controls.
- [ ] Add a collapsible `Example (JSON)` section (mirror the existing Constraints fold pattern) for those two branches. Contents: a `<textarea>`, inline error label when invalid JSON.
- [ ] Local state `const [raw, setRaw] = useState(value.example !== undefined ? JSON.stringify(value.example, null, 2) : '')` plus `const [err, setErr] = useState<string | null>(null)`.
- [ ] `onBlur`: trim; if empty → emit `onChange` with `{ ...value, example: undefined }` (drop key behavior via parent spreading). If non-empty → `JSON.parse`; on success clear error and emit `{ ...value, example: parsed }`; on parse error set `err` and do NOT mutate `value`.
- [ ] i18n keys (both locales):
  - en: `"example": "Example (JSON)"`, `"seedFromExample": "Seed from example"`, `"invalidJson": "Invalid JSON"`
  - zh-TW: `"example": "範例 (JSON)"`, `"seedFromExample": "從範例填入"`, `"invalidJson": "JSON 格式錯誤"`
- [ ] Tests:
  - Valid JSON → value.example updated.
  - Empty blur → value.example undefined (not `null`, not `{}`).
  - Invalid JSON → inline error, value.example unchanged.
  - String/primitive type → textarea NOT rendered.
- [ ] Full suite green.
- [ ] Commit: `feat(web): Example JSON editor in TypeBuilder`.

### Task 3: RunPanel seed button

**Files:** `RunPanel.tsx`, `RunPanel.seed.test.tsx` (new) or extension, `en.json`/`zh-TW.json` already updated in Task 2.

- [ ] Import `resolveExample` from `../schema/resolveExample`.
- [ ] Compute `const seedable = endpoint?.requestBody ? resolveExample(spec, endpoint.requestBody) : undefined;`
- [ ] Button next to body `<label>`: `t('seedFromExample')`, `disabled={seedable === undefined}`.
- [ ] Handler: `setBodyText(JSON.stringify(seedable, null, 2))`.
- [ ] Tests (new file `apps/web/tests/ui/RunPanel.seed.test.tsx` to keep RunPanel test files focused):
  - ref to object-with-example → button enabled, click fills textarea.
  - no requestBody → button disabled.
  - primitive requestBody → button disabled.
  - object requestBody without example → button disabled.
- [ ] Full suite green.
- [ ] Commit: `feat(web): Seed from example button in Try-it panel`.

### Task 4: OpenAPI + Markdown exporters

**Files:** `openapi.ts`, `markdown.ts`, their test files

- [ ] **OpenAPI** — in `toSchema`, `object` and `array` branches emit `s.example = t.example` when defined. Do not emit an `example: undefined` key.
- [ ] **Markdown** — in the Types loop, after the skeleton block for each named type, if the type has an `example` field directly (no resolution needed — the user authored it on this type), append:

  ```
  #### Example

  ```json
  <JSON.stringify(example, null, 2)>
  ```
  ```

  The new `h()` helper already bumps section depth in grouped mode; for Types the depth is fixed at 3 (`###` for type name, `####` for Example).
- [ ] Exporter tests:
  - OpenAPI: object+example → schema.example present; array+example → schema.example present; no example → no key.
  - Markdown: type+example → `#### Example` + fenced block; type without example → no heading.
- [ ] Full suite green.
- [ ] Commit: `feat(export): examples in OpenAPI schemas and Markdown`.

### Task 5: E2E + docs move

- [ ] Playwright smoke green (fix selector only if the new Seed button breaks one).
- [ ] `git mv docs/specs/active/2026-04-18-type-examples.md docs/specs/done/` and same for the plan.
- [ ] Commit: `docs: mark type-examples done`.

---

## Open Questions

None.
