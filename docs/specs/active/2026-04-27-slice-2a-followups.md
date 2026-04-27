# Spec — Slice 2A follow-ups (Delete folder + Duplicate + toOpenApi typing)

## Problem

Slice 2A (codegen-export-popover) shipped with three deliberate gaps the code review captured as follow-ups:

1. **"Delete folder" menu item** was deferred — no underlying store action and undecided semantics. Today users can dissolve a folder only by dragging every item out one at a time.
2. **"Duplicate" menu item** is rendered as a disabled placeholder on every endpoint and type row. Looks unfinished; users can't quickly copy an endpoint to tweak it.
3. **`toOpenApi` returns `any`**, forcing every consumer (web's ExportPopover, LivePreviewPanel) to use an `as unknown` cast. Loses type safety on the boundary.

Closing all three at once keeps the affordances consistent and removes a few small papercuts before they age.

## Success criteria

### Delete folder

- Endpoint folder rows' OverflowMenu gains a "Delete folder" item. Clicking shows a `confirm()` prompt: *"Delete folder '{path}' and {N} endpoint(s) inside?"* Cancel is a no-op; OK deletes every endpoint whose `folder` equals the path or starts with `path/`.
- Type folder rows' OverflowMenu gains the same item with the type-flavored counterpart message. Deletes every type whose key starts with `path/` (e.g. `auth/User`, `auth/oauth/Code`).
- New store actions `deleteEndpointFolder(path: string): Promise<void>` and `deleteTypeFolder(path: string): Promise<void>` on `useSpecStore`. Each removes the matching items and persists via `setSpec`.
- Endpoint variant also clears each removed endpoint's history bucket (mirrors `deleteEndpoint`).
- Type variant: if a type that's about to be deleted is referenced by something OUTSIDE the folder being deleted, abort with an error (mirrors the existing single-type "in use" guard). The confirm prompt should read `Cannot delete: 'auth/User' is referenced by N other items` in that case (we abort BEFORE confirm shows). Surface as a non-blocking message via `alert()` to keep the implementation small (matches how the existing single-type `disabled` button + tooltip communicates the constraint today).
- Tests: after delete, no endpoint/type with the prefix remains; selection clears if a deleted endpoint was selected; history bucket is cleared.

### Duplicate

- Endpoint rows' OverflowMenu's Duplicate item becomes active. Generates a copy via `duplicateEndpoint(id)`:
  - New `id: crypto.randomUUID()`.
  - All other fields identical (path, params, requestBody, responses, etc.).
  - The new endpoint is inserted right after the source in `spec.endpoints` (preserves visual proximity in the list).
  - Returns the new ID; the UI selects it so the user can immediately edit.
- Type rows' Duplicate becomes active via `duplicateType(key)`:
  - New key uses a non-colliding name suffix: `User` → `UserCopy` (or `UserCopy2`, `UserCopy3` until a non-collision is found).
  - Folder-keyed types preserve the folder: `auth/User` → `auth/UserCopy`.
  - All fields deep-cloned so the duplicate doesn't share mutable references.
  - The new type is inserted right after the source in `spec.types` (object insertion order preserved).
  - Returns the new key; the UI selects it.
- New helper `nextAvailableTypeName(spec, baseName, folder?)` in `@zwaggen/core` (or inline in the store action — implementer's call).
- EndpointEditor header's Duplicate menu item also becomes active for the currently-open endpoint.
- Tests: duplicate has a fresh ID/key, all fields equal, new item is selected, ordering preserves source position.

### `toOpenApi` return type

- Define a minimal `OpenApiDocument` interface in `packages/core/src/exporters/openapi.ts`:
  ```ts
  export interface OpenApiDocument {
    openapi: string;
    info: { title: string; version?: string; description?: string };
    servers?: Array<{ url: string }>;
    paths: Record<string, Record<string, unknown>>;
    components?: { schemas?: Record<string, unknown>; [key: string]: unknown };
    tags?: Array<{ name: string }>;
  }
  ```
- Change `toOpenApi(spec, opts?): any` → `toOpenApi(spec, opts?): OpenApiDocument`.
- Internal `any` types stay (the function is a builder; tightening every internal would balloon scope). Cast at the return boundary: `return doc as OpenApiDocument`.
- Update consumers:
  - `apps/web/src/ui/ExportPopover.tsx`: drop the `as { components?: { schemas?: Record<string, unknown> } }` cast in the type-scope branch and the `as unknown` casts elsewhere.
  - `apps/web/src/ui/LivePreviewPanel.tsx`: drop the `as unknown` cast.
  - Other call sites: `grep -rn "toOpenApi" apps packages` — verify each still compiles.

## Out of scope

- **Per-folder delete-mode setting** (cascade vs unfolderize). v1 is cascade only. If users want unfolderize they can drag items out as today.
- **Undo for delete-folder** — out of v1 scope. The confirm prompt is the safety net.
- **Duplicate name suffix customization** ("Copy" vs "_copy" vs " (copy)"). Hardcoded `Copy` for v1. Easy to revisit.
- **Bulk duplicate** (duplicate a folder = duplicate all items inside). The existing folder-export popover approximates this for one-shot sharing.
- **Tightening `toOpenApi`'s internal builder types**. The return-type widening is enough; internals can stay as `any`.

## Approach

### Store actions (`apps/web/src/state/store.ts`)

Add to the `SpecStore` interface and `create<SpecStore>` body:

```ts
deleteEndpointFolder(path: string): Promise<void>;
deleteTypeFolder(path: string): Promise<{ ok: true } | { ok: false; reason: 'inUse'; usedBy: string[] }>;
duplicateEndpoint(id: string): Promise<string>;
duplicateType(key: string): Promise<string>;
```

`deleteTypeFolder` returns a Result so the UI can surface a "cannot delete — in use" alert. `deleteEndpointFolder` is unconditional (no in-use guard needed; endpoints aren't referenced by other items).

Implementations are straightforward `set({ spec: ... })` followed by `setSpec(...)`. For the type variant's in-use check, walk every type/endpoint in the spec and look for `RefType.ref === toBeDeletedKey` or `extends: [..., toBeDeletedKey, ...]`. Reuse any existing usage helper in the codebase (search for `referencedBy` / `usages` in TypePanel; if no helper, write a small one).

`duplicateEndpoint`:
```ts
async duplicateEndpoint(id) {
  const spec = get().spec;
  const idx = spec.endpoints.findIndex((e) => e.id === id);
  if (idx < 0) return id; // no-op
  const newId = crypto.randomUUID();
  const copy = structuredClone(spec.endpoints[idx]!);
  copy.id = newId;
  const next = { ...spec, endpoints: [...spec.endpoints.slice(0, idx + 1), copy, ...spec.endpoints.slice(idx + 1)] };
  await get().setSpec(next);
  set({ selectedEndpointId: newId });
  return newId;
}
```

`duplicateType`:
```ts
async duplicateType(key) {
  const spec = get().spec;
  const def = spec.types[key];
  if (!def) return key;
  const { folder, name } = splitKey(key);
  const newName = nextAvailableTypeName(spec, name, folder);
  const newKey = joinKey(folder, newName);
  // Insert right after the source by rebuilding the Record in order
  const entries = Object.entries(spec.types);
  const sourceIdx = entries.findIndex(([k]) => k === key);
  const newTypes: Record<string, TypeDef> = {};
  entries.forEach(([k, v], i) => {
    newTypes[k] = v;
    if (i === sourceIdx) newTypes[newKey] = structuredClone(def);
  });
  const next = { ...spec, types: newTypes };
  await get().setSpec(next);
  return newKey;
}
```

### `nextAvailableTypeName` helper

```ts
// packages/core/src/schema/duplicateName.ts (or inline)
import { joinKey } from './folders';
export function nextAvailableTypeName(spec: Spec, baseName: string, folder?: string): string {
  const exists = (n: string) => spec.types[joinKey(folder, n)] !== undefined;
  const suffix = 'Copy';
  if (!exists(baseName + suffix)) return baseName + suffix;
  let i = 2;
  while (exists(`${baseName}${suffix}${i}`)) i++;
  return `${baseName}${suffix}${i}`;
}
```

Export from `@zwaggen/core` so the store can import it. Test independently.

### UI wiring

- **EndpointList folder rows**: add a `Delete folder` `<MenuItem danger>` to `FolderRowMenu` (currently has Export folder + Rename folder). Add a `confirm()` prompt with the count, then call `deleteEndpointFolder(path)`.
- **EndpointList endpoint rows**: drop `disabled` from the Duplicate `<MenuItem>` (currently in `EndpointRowMenu`); wire to `duplicateEndpoint(id)`.
- **TypePanel folder rows**: same as endpoint folder, but uses `deleteTypeFolder(path)`. Handle the `inUse` Result by surfacing an `alert("Cannot delete: 'auth/User' is referenced by N items")`.
- **TypePanel type rows**: drop `disabled` from Duplicate; wire to `duplicateType(key)`. Switch the panel's selection to the new key.
- **EndpointEditor header**: drop `disabled` from Duplicate; wire to `duplicateEndpoint(currentEndpointId)`. Selection follows the new ID.

The `(coming soon)` helper-text inside disabled MenuItems can be removed entirely from those four sites once the items become active.

### `toOpenApi` typing

```ts
// packages/core/src/exporters/openapi.ts
export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version?: string; description?: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown>; [key: string]: unknown };
  tags?: Array<{ name: string }>;
}

export function toOpenApi(spec: Spec, opts?: { only?: CodegenSlice }): OpenApiDocument {
  // ... existing body ... return doc as OpenApiDocument;
}
```

Re-export `OpenApiDocument` from `packages/core/src/index.ts`.

In `apps/web/src/ui/ExportPopover.tsx`:
- Type-scope branch line ~209: drop the `as { components?: ... }` cast — `toOpenApi` now returns the typed shape directly.
- Endpoint scope's `JSON.stringify(toOpenApi(...) as unknown, null, 2)` and the folder branch's similar cast: drop the `as unknown`.

In `apps/web/src/ui/LivePreviewPanel.tsx`: drop `as unknown` from the `toOpenApi` call inside `buildPreviewTabs`.

### Tests

- `apps/web/tests/state/store.deleteEndpointFolder.test.ts` — endpoint folder delete removes nested items, clears selection if applicable, clears history.
- `apps/web/tests/state/store.deleteTypeFolder.test.ts` — type folder delete removes nested items; in-use guard surfaces the Result.
- `apps/web/tests/state/store.duplicate.test.ts` — duplicate endpoint and duplicate type create fresh IDs/keys, deep clones, insert at expected position.
- `packages/core/tests/schema/duplicateName.test.ts` — `nextAvailableTypeName` returns `Copy`, `Copy2`, `Copy3` cascading; respects folder scope.
- Update the existing menu tests in `EndpointList.folders.test.tsx` and `TypePanel.folders.test.tsx` to assert the new "Delete folder" menuitem appears.
- Optional: a quick smoke test on `apps/web/tests/ui/EndpointEditor.duplicate.test.tsx` that opens the menu and clicks Duplicate.

### Risks

- **structuredClone availability** — supported in modern browsers + Node 17+. Vitest env is jsdom on Node 20+, so it works. If older targets are a concern, fall back to `JSON.parse(JSON.stringify(...))` (loses dates, files — acceptable for TypeDef which is JSON-like).
- **Type folder delete in-use detection** — for a deeply-nested folder with many internal cross-refs, the "in use" walker needs to correctly distinguish "used inside this folder" from "used outside this folder". For v1, only ABORT if the reference comes from outside the folder being deleted. Internal references are fine to delete together.
- **`structuredClone` on a TypeDef containing functions** — TypeDefs are pure data (no functions), so safe.
- **Confirm prompt strings** are unlocalized? — use the existing pattern: `t('deleteFolderConfirm', { path, count })` with i18n keys in en + zh-TW.

## Done definition

- 4 new store actions implemented and tested.
- `nextAvailableTypeName` helper in `@zwaggen/core` with unit tests.
- All 4 menu items wired (Delete folder × 2, Duplicate × 3 surfaces).
- `OpenApiDocument` interface defined; all `as unknown` / `as { components: ... }` casts removed from web consumers.
- New i18n keys: `deleteFolderConfirm`, `deleteTypeInUse` in both locales.
- Existing tests still pass; new tests cover each action.
- TODO line "Slice 2A follow-ups" ticked.
- Spec + plan moved to `done/`.
- Branch `plan/slice-2a-followups` pushed.
