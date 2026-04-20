# Spec — Folders for Types and Endpoints

**Status:** active
**Date:** 2026-04-20
**Scope:** `apps/web` (playground UI, data model, importers/exporters). `apps/docs` unaffected. CLI (`@zwaggen/cli`, `@zwaggen/core`) affected only if it reads type/endpoint keys; see migration notes below.

## Goal

Let users organize types and endpoints into nested folders so large specs stay navigable. A type or endpoint named the same short name can coexist in different folders. Folders are opt-in: a spec that never sets a folder renders exactly as today.

## Motivation

`spec.types` is a flat `Record<string, TypeDef>` and `TypePanel` renders it as a flat alphabetical list. Once a project has 30+ types the list becomes hard to scan, and there is no way to signal grouping (auth types vs. admin types vs. shared). The same problem bites endpoints past ~20 entries — existing tag-grouping (`schema/groupByTag.ts`) is flat and single-level, so you cannot express `users/admin` inside `users`.

A related pain: the current type name is a global identifier, so two distinct `User` shapes (`auth.User` for login, `admin.User` for the mgmt console) must be renamed to coexist. Folders namespace the short name, so both can be `User` living in different folders.

## Non-goals

- **Drag-and-drop.** v1 uses a path text field in the editor. DnD is a separate follow-up TODO.
- **Type extension / inheritance.** Sibling feature, separately tracked. Folders and extension are orthogonal.
- **Explicit folder entities** with ids, descriptions, or ordering. Folders are derived from item paths — no separate `folders[]` in the spec.
- **Multi-document OpenAPI export** (one doc per folder). Out of scope; revisited once folders land.
- **CLI (`zwag run`) surface changes.** CLI reads the spec as-is; if it addresses types/endpoints by name the migration notes cover it.
- **Markdown exporter polish.** The existing markdown exporter has known issues; folders get a minimal pass (headings per folder) without a broader refactor.

## Design

### Data model

- **Type keys become full paths.** `spec.types["auth/User"]` replaces `spec.types["User"]` for any type placed in a folder. Root-folder types keep short-name keys (`spec.types["User"]`), so existing specs need no data migration.
- **`RefType.ref` stores the full path.** `{ kind: "ref", ref: "auth/User" }`. Refs with no slash resolve to root-folder types (unchanged meaning for pre-folder refs).
- **`Endpoint` gains `folder?: string`.** A single path like `"users/admin"`. Unset / empty = root. Independent of the existing `tags: string[]` field.
- **No `folders` entity, no ids.** Folder existence is derived from item paths. Empty folders do not exist — a folder vanishes when its last item leaves.
- **Separator:** `/`. Normalization on write/load: trim both ends, collapse runs of `/`, drop leading/trailing `/`, empty → undefined. Each segment must match `[A-Za-z0-9_. -]+`.
- **Schema version bump:** `CURRENT_SCHEMA_VERSION` goes `1 → 2`. Loader accepts v1 specs untouched (absent folder fields = all-root); saver writes v2. No data translation required on upgrade.

### UI behavior — TypePanel

- **Rendering:** if any type has a `/` in its key, render the tree. Otherwise keep today's flat alphabetical list (progressive enhancement, zero visual change for pre-folder specs).
- **Tree structure:** root-folder types sorted alphabetically at the top, folders sorted alphabetically below with chevron + name + item count, contents indented under each. Arbitrary depth; `ml-3` per level.
- **Type editor additions:** a **Folder** text input above the existing Name input. Editing the folder path triggers an atomic move (same transaction as rename): `spec.types["auth/User"]` → `spec.types["admin/User"]`, with all inbound refs rewritten via the extended `renameType` logic.
- **Folder node actions:** an icon button appears on hover for **Rename folder** — inline-edit the segment; on save, every descendant item's path is rewritten in one `setSpec` call. No DnD in v1.
- **Collapse state:** per-folder, persisted in `uiPrefs.typeFolderCollapsed: Record<string, boolean>` keyed by full path.

### UI behavior — EndpointList

- **Rendering rules, in priority order:**
  1. Any endpoint has a `folder` set → folder tree (same shape as TypePanel).
  2. Else, any endpoint has tags → today's tag-group rendering (unchanged).
  3. Else, flat list (unchanged).
- **Endpoint editor additions:** same Folder text input.
- **Tags remain** as data on every endpoint and still round-trip through OpenAPI. They are not rendered on the sidebar rows in folder mode (the tree drives navigation); users inspect/edit tags in the endpoint editor. Adding tag chips to rows is a deferred polish.
- **Collapse state:** `uiPrefs.endpointFolderCollapsed: Record<string, boolean>`.

### Input validation and affordances

- Path validated on blur: trim, normalize, reject invalid segments with an inline error and revert to the prior value.
- Autocomplete suggests sibling folder paths (types suggest from existing type folders, endpoints from existing endpoint folders — independent namespaces).
- Collision on move: moving `User` into `auth/` where `auth/User` already exists is rejected with the same error surface as today's rename-collision path.

### OpenAPI round-trip

**Types (`components.schemas`)**

- **Export key:** `folder.replace(/\//g, '_') + '_' + shortName` when a folder is set; plain `shortName` at root. Every schema with a folder carries `x-folder: "<path>"`. Example: `spec.types["auth/User"]` exports as `components.schemas.auth_User` with `x-folder: "auth"`.
- **Internal ref → `$ref` rewriting:** `RefType.ref = "auth/User"` becomes `$ref: "#/components/schemas/auth_User"`. Root-folder refs keep today's `$ref: "#/components/schemas/User"` form.
- **Import:** for each schema, read `x-folder`. If present, internal key = `<x-folder>/<shortName>` where shortName is the schema key with the flattened `<folder>_` prefix stripped. If `x-folder` absent (foreign OpenAPI), treat the whole schema key as a root-folder short name.
- **Foreign imports** land flat by design; users can organize them afterward by editing Folder.

**Endpoints (operations)**

- **Export:** `operation["x-folder"] = endpoint.folder` when set; omitted otherwise. `operation.tags` unchanged.
- **Import:** read `x-folder` → `endpoint.folder`. Tags handled as today.

**JSON Schema export (`exporters/jsonschema.ts`)**

- Follows the same flatten + `x-folder` convention so the exported bundle is self-consistent with the OpenAPI file.

**Markdown export**

- Adds a `### Folder: <path>` heading before each folder's items. Root-folder items keep today's flat rendering. Deliberately minimal — a broader markdown refactor is out of scope.

### Migration

- Loader handles v1 specs by rewriting `schemaVersion` to 2 on read; nothing else to change because absent folder fields already mean "root folder."
- Existing in-memory operations that key on short names (rename, buildUsageIndex, collectBrokenRefs) are extended to treat keys as paths. Behavior is identical for path-less specs.
- Saved drafts in IndexedDB: the draft store already serializes the whole Spec; loading an old draft goes through the same v1 → v2 upgrade path.
- CLI (`zwag run`): currently addresses endpoints by method+path, not by name or folder — no change required. If a future CLI flag references types by name, it should accept full paths (`auth/User`) and fall back to unique short-name matching for convenience.

### Edge cases

- **Path normalization** runs on every write, not only the editor input, so programmatic updates (import, rename) always produce canonical paths.
- **Deleting a type with inbound refs**: blocked, same behavior as today.
- **Moving a referenced type**: inbound refs auto-rewrite.
- **Endpoint `(method, path, folder)` duplicates**: allowed — endpoints are uuid-keyed; no new uniqueness constraint.
- **Max depth**: no hard cap. Tree indentation uses `ml-3` per level so deeply-nested items remain legible; very deep paths should be rare.
- **Name collisions on OpenAPI import**: since foreign imports lack `x-folder`, two schemas named the same short name at the root conflict already under today's flat model — unchanged.

## Testing

- `schema/folders.test.ts` — path normalization, collision detection, move-by-path helper.
- `schema/rename.test.ts` — new cases for bulk folder rename (all descendants rewritten, refs updated) and moving a type between folders.
- `schema/serialize.test.ts` — v1 → v2 upgrade on load, v2 write.
- `exporters/openapi.test.ts` + `importers/openapi.test.ts` — `x-folder` write/read, flat-key recovery, foreign import (no `x-folder`), ref rewriting.
- `exporters/bundle.test.ts` — round-trip fixture with depth-1 and depth-2 folders deep-equals the original spec.
- `ui/TypePanel.test.tsx` — tree rendering when any type has a folder; flat list when none; collapse state; rename-folder bulk move.
- `ui/EndpointList.test.tsx` — priority order (folder → tag → flat); tags remain visible as chips when folders drive the tree.
- `e2e/folders.spec.ts` — Playwright: create a folder by editing an item's path, verify tree materializes, rename a folder, collapse state persists across reload.

## Open questions

None — user confirmed multi-level nesting, same-short-name-across-folders, path text field for v1 (DnD deferred), separate `folder` field on endpoints (tags untouched), flatten-with-`x-folder` OpenAPI export, folder usage opt-in (progressive).
