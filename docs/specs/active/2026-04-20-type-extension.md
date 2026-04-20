# Spec — Type extension / inheritance

**Status:** active
**Date:** 2026-04-20
**Scope:** `packages/core/src/schema/` (data model + resolver + rename), `packages/core/src/exporters/` + `apps/web/src/importers/openapi.ts` (allOf round-trip), `apps/web/src/ui/TypeBuilder.tsx` (parent picker + inherited panel + override/revert), `apps/web/src/validator/`, and the existing markdown exporter (clickable refs).

## Goal

Let `ObjectType`s extend one or more parent object types, inheriting their fields. Child types can override any inherited field by redefining it under the same name, or add new fields that don't exist in any parent. The shape round-trips through OpenAPI / JSON Schema via `allOf`; a v1 or v2 spec opens unchanged on v3 via the migration framework.

## Motivation

Users today must duplicate field definitions across related types (a `User` and `AdminUser` that share 80% of fields). This is error-prone and makes intent implicit — "these two things are variants of the same base" is lost. Type extension captures the relationship first-class, cuts duplication, and maps directly to the `allOf` idiom that the rest of the OpenAPI ecosystem already speaks.

It's also the sibling feature to folders (both shipped this week). Folders organize *where* types live; extends organizes *how they relate*. Together they form the type-modeling story: grouped types with inheritance, one spec, one visual place to manage them.

## Non-goals

- **Extending non-object kinds** (unions, arrays, primitives). OpenAPI `allOf` with non-objects has no clean semantics; we keep inheritance scoped to object types.
- **Removing an inherited field.** `allOf` can't express "minus this field". If you need a parent without a field, don't extend that parent.
- **Generic / conditional extends.** No `extends T<U>` or `extends X if Y`. Not in OpenAPI's vocabulary; not worth the complexity now.
- **Parent reorder via drag-and-drop.** V1 uses chip pick/remove order; reorder is a deferred polish (new TODO entry).
- **"Effective shape" preview panel** in TypeBuilder. Inherited + override rows already convey effective shape.
- **Auto-recover extends from historical all-inline `allOf` imports.** If an OpenAPI file's `allOf` is only inline objects (no `$ref`s), we keep today's flatten-behavior for back-compat — users can opt into the extends structure by re-naming the parts into named types later.
- **Cross-spec inheritance** (extending a type defined in a different spec file). Out of scope.

## Design

### Data model

- `ObjectType` in `packages/core/src/schema/types.ts` gains one field: `extends?: string[]`. Ordered list of parent type keys in the same canonical path form used by `RefType.ref` (e.g., `"auth/User"`, `"admin/User"`). `undefined` / empty array = no inheritance (backwards-compatible).
- `ObjectField` shape unchanged. Child's `fields[]` continues to carry only the child's own additions and overrides — inherited fields are resolved on demand, never duplicated onto the child.
- `strict` on the effective type is the **OR** of child's `strict` and all parents' `strict`. If any member of the inheritance chain is strict, the effective type is strict. Child can set `strict: true` but cannot unset a parent's strictness — this matches OpenAPI `allOf` semantics where `additionalProperties: false` on any member makes the whole strict.
- **Override semantics**: if `child.fields[i].name` matches a parent field's name, the child entry is a complete redefinition — type, required flag, description, constraints can all differ. No partial merging. Child that doesn't list a name inherits the parent definition unchanged.
- **Precedence**: parents merged left-to-right in declaration order (later parents win on conflict), then child overrides all. Example: `Foo extends [Bar, Baz]` with `Bar: {x,y}`, `Baz: {y,z}`, `Foo: {z,w}` → effective `Foo` = `{x: from Bar, y: from Baz, z: from Foo, w: from Foo}`.
- **Schema version bump: v2 → v3.** The second use of the new migration framework. v2→v3 migrator is a no-op data-wise (absent extends = no inheritance, same as v2 behavior); only the version stamp changes. `versions/v2.ts` freezes the pre-extends shape.

### Resolver (`schema/resolveObject.ts` — new)

Single export:

```ts
export function resolveObject(spec: Spec, key: string): ObjectType
```

Walks the `extends` chain depth-first, left-to-right. Returns a flattened `ObjectType` with merged fields (precedence above) and `strict` = OR of chain. Maintains a visited Set keyed by type key to dedupe diamond inheritance (Foo extends Bar+Baz, both extend Base: Base is merged once, first-visit-wins). On cycle, throws `InheritanceCycleError` carrying the cycle path for debugging — callers at the UI boundary catch and surface as a broken state.

**Consumers that call the resolver (all existing, each gains one resolve step at the ref boundary):**

- `apps/web/src/validator/validate.ts` — when validating a response against a type, if the type is `ObjectType` with `extends.length > 0`, use `resolveObject(spec, key)` first.
- `packages/core/src/schema/resolveExample.ts` — same treatment: walk parents to assemble example field values.
- `packages/core/src/schema/diff.ts` — when comparing two types, compare the **resolved** shape of each. A refactor "flat `Foo`" → "`Foo extends Bar`" with an identical effective shape produces an empty diff (non-breaking).
- **Exporters** — OpenAPI and JSON Schema preserve the hierarchy via `allOf`, so they do NOT pre-flatten. Markdown does flatten for the param-table type column indirectly via `typeLabel(RefType)` which just emits a link to the parent's section.
- **TypeBuilder** — does NOT resolve for the editor view. Users always see their declared hierarchy raw. The resolver is called only by the inherited-fields panel, to display parents' effective fields (excluding child-own overrides).

### Validation helpers

- `collectBrokenRefs(spec)` extended: a `type.extends[i]` pointing at a missing or non-object type is reported as a broken ref with location `types:<key>:extends[i]`.
- New `collectInheritanceCycles(spec): Array<{type: string; cycle: string[]}>` — returns all cycles found, one entry per cycle with the path. Runs alongside the existing broken-refs check in `TypePanel`'s top-of-panel alert strip.
- Parent picker UI consults a cheap `wouldCreateCycle(spec, childKey, candidateParent): boolean` helper before committing a chip selection. Prevents cycles at write-time.
- `renameType` and `renameFolder` rewrite `extends[]` entries that match the old key (in addition to the `RefType.ref` rewrites they already do).

### OpenAPI + JSON Schema round-trip

**Export** (`packages/core/src/exporters/openapi.ts` and `jsonschema.ts`):

When `objectType.extends?.length > 0`:
- Emit `allOf: [ ...parents.map(p => ({ $ref: flatten(p) })), ...(child.fields.length ? [inlineChildSchema] : []) ]`.
- `inlineChildSchema` carries only the child's own fields (with its `required` subset), `description` if child has one, `x-folder` if set (respecting the folder feature), and `additionalProperties: false` only when child's own `strict` is set (parent strictness propagates at resolve time, not at export — avoids double-encoding).
- Pure-inheritance types (no child fields): emit `allOf: [...parents]` with no inline member.
- Types without `extends`: existing behavior unchanged — flat object schema.

**Import** (`apps/web/src/importers/openapi.ts`, function `readAllOf`):

Classify the allOf members:
1. Collect every `$ref` pointing into `components.schemas` (after `keyMap` resolution) → becomes the `extends[]` list, in source order.
2. Collect inline object members. If exactly ONE inline member → becomes the child's own `fields` + `description` + `strict` (mapping `additionalProperties: false`).
3. If the allOf contains **two or more** inline objects with no $refs → fall back to today's flatten-all behavior (preserves back-compat for historical specs authored without extends).
4. If **zero $refs + zero inline** (empty or unresolvable allOf) → warning, return undefined (existing behavior).
5. **Any non-object inline** → warning, return undefined (existing).

Round-trip invariant: a spec with `extends` exports to `allOf`, reimports to a deep-equal `extends` + `fields` combination. Single test case pins this.

**Markdown exporter** (`apps/web/src/exporters/markdown.ts`):

- New helper `slugifyHeading(name: string): string` producing GFM-compatible anchors: lowercase, strip non-alphanum, collapse spaces to `-` (e.g. `"auth/User"` → `"authuser"`, `"Folder: auth"` → `"folder-auth"`, `"My Type v1.0"` → `"my-type-v10"`).
- `typeLabel(RefType)` returns `[${t.ref}](#${slugifyHeading(t.ref)})` instead of the bare name. Union/array members recurse so mixed types stay correctly linked.
- When emitting a type with `extends.length > 0`, prepend `**Extends:** [Bar](#bar), [Baz](#baz)` before the skeleton JSON block.
- Fenced JSON skeleton (from `skeleton`) stays ASCII `#RefName` — markdown doesn't parse inside fences.
- Inherited fields are not re-rendered on the child's section; the links carry the reader to parent sections.

### UI in TypeBuilder (`apps/web/src/ui/TypeBuilder.tsx`)

When the selected type is `ObjectType`, controls render in this order (top → bottom):

1. **Strict checkbox** (existing).
2. **Extends chip-picker (new)**. Labeled `Extends`. Multi-select dropdown. Options = all other object types in `spec.types`, filtered to exclude self and any candidate that would form a cycle (`wouldCreateCycle` check at render). Selected parents render as chips with an `×` to remove. Empty state: "No parents — add one to inherit fields." Broken parent refs (target deleted or non-object) render red with a warning tooltip.
3. **Inherited fields panel (new, collapsible, only when `extends.length > 0`)**. Header: "Inherited fields (N)". Body: one row per effective parent field (`resolveObject` applied to parent list only, excluding child's own fields). Each row is dimmed with `name · type · required?` + an `Override` button. Clicking Override appends an entry to `child.fields` pre-populated with the parent's field definition; the row then disappears from the inherited panel and appears in the own-fields list with an "(override)" badge.
4. **Fields list (existing shape)**. Fields whose name matches an inherited name gain:
   - An "(override)" badge next to the name.
   - A small `Revert to inherited` action that removes the child entry and restores the inherited row.
5. **No parent-reordering UI in v1.** Parent order = pick order. Reorder requires remove + re-pick (TODO for drag-reorder).

The existing `TypePanel` alert strip (already surfaces `collectBrokenRefs` results) picks up the new broken-ref case (missing/non-object parent) and the cycle cases transparently — new check feeds into the same array.

### Tests

- `packages/core/tests/schema/resolveObject.test.ts` (new) — single parent, multi-parent, diamond (Base merged once), child override, parent override chain, strict OR'd, missing parent (skipped with warning), cycle → throws.
- `packages/core/tests/schema/rename.test.ts` (extend) — renaming a type rewrites `extends[]` entries.
- `packages/core/tests/schema/cycles.test.ts` (new) — `collectInheritanceCycles` finds cycles in multi-step chains.
- `apps/web/tests/exporters/openapi.extends.test.ts` (new) — pure-inheritance and mixed (inherit + add field) export as expected allOf; round-trip invariant.
- `apps/web/tests/importers/openapi.extends.test.ts` (new) — recover extends from $ref + inline; multi-inline falls back to flatten; broken $ref surfaces as warning.
- `apps/web/tests/exporters/markdown.test.ts` (extend) — refs in param tables render as `[X](#x)` links; extends line present with clickable parent names.
- `apps/web/tests/ui/TypeBuilder.extends.test.tsx` (new) — picker filters cycling candidates; override button moves field into own list with badge; revert restores; broken parent renders red.
- `apps/web/e2e/extends.spec.ts` (new) — Playwright: create Base with two fields; create Child extends Base via the chip picker; override one field; confirm inherited panel reflects state; trigger OpenAPI export; confirm `allOf` present in the downloaded bundle.

### Migration (v2 → v3)

1. Freeze v2 shape — copy current `Spec`/`ObjectType`/`Endpoint`/`SpecV1Endpoint` patterns into `packages/core/src/schema/versions/v2.ts` as `SpecV2` + `SpecV2ObjectType` etc. (Endpoint shape unchanged from v2 → v3; only `ObjectType` gains `extends`.)
2. Bump `CURRENT_SCHEMA_VERSION = 3` in `packages/core/src/schema/types.ts`. Add `extends?: string[]` to `ObjectType`.
3. Append a MIGRATIONS entry `{ from: 2, to: 3, migrate: (s: SpecV2): Spec => ({ ...s, schemaVersion: 3 }) }`. Absent `extends` = no inheritance, so no data transform.
4. Tests: `migrations.test.ts` gains cases for v2 → v3 (no-op payload) and v1 → v3 walk via v1 → v2 → v3 chain. `serialize.test.ts` gains a "still rejects v99" case (unchanged behavior, but pinned).
5. Update `docs/rules/spec-versioning.md` current-version line to 3 and add the v2 → v3 bullet describing what it introduced.

### Edge cases

- **Cycle detected at resolve time**: `resolveObject` throws `InheritanceCycleError`. UI boundary (TypeBuilder/TypePanel) catches and renders the broken state in the alert strip. `collectInheritanceCycles` should catch this at spec-validation time before resolution is called, but the throw is defense-in-depth.
- **Parent not object**: `collectBrokenRefs` reports it. Resolver skips the non-object parent with a warning logged to the console (not user-facing, already a broken-ref alert).
- **Parent deleted while child still extends**: extension counts as a usage under the existing delete-with-usage guard. Deletion blocked. Forcing deletion would orphan the child — not allowed.
- **Field name clash across parents**: later parent wins silently. By-design allOf behavior. No warning to user.
- **Diamond inheritance** (Foo → Bar, Baz; both → Base): visited Set dedupes Base on second visit. Base's fields come from the first path's traversal; if Bar and Baz override Base differently, precedence still applies (later parent wins). Deterministic.
- **Renaming a type that's a parent**: `renameType` rewrites all `extends[]` entries pointing at the old key (alongside the existing ref rewrites).
- **Moving a type between folders**: the key changes (`auth/User` → `admin/User`), so all `extends[]` entries get rewritten — same plumbing as ref rewriting in the folders feature.

## Open questions

None — decided: multi-parent extends, full override, left-to-right precedence, object-kind-only, v2 → v3 bump, allOf round-trip with a single-inline constraint, markdown refs become clickable as part of this scope, no drag-reorder in v1.
