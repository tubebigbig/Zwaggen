# Slice 2A follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent surgical follow-ups from the codegen-export-popover code review:
1. `toOpenApi` return-type tightening + drop the `as unknown` casts.
2. Delete folder menu items (endpoint + type) backed by new store actions.
3. Duplicate menu items (endpoint + type, plus EndpointEditor header) backed by new store actions and a `nextAvailableTypeName` helper.

**Architecture:** Pure additive — no schema changes. Two new store actions per slice (delete-folder × 2 + duplicate × 2). One new pure helper in `@zwaggen/core`. One typed interface for `toOpenApi`'s return.

**Tech Stack:** TypeScript, Zustand store, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-27-slice-2a-followups.md`. Constraints:

- Delete folder is **cascade** (with confirm prompt showing count).
- Type folder delete aborts via `alert` if any in-folder type is referenced from outside the folder.
- Duplicate names types as `${name}Copy`, then `Copy2`, `Copy3` ... until non-colliding.
- `toOpenApi` keeps internal `any` (return-boundary typing only).

---

### Task 1: `toOpenApi` return-type tightening

**Files:**
- Modify: `packages/core/src/exporters/openapi.ts`
- Modify: `packages/core/src/index.ts` (re-export `OpenApiDocument`)
- Modify: `apps/web/src/ui/ExportPopover.tsx` (drop `as unknown` and `as { components: ... }` casts)
- Modify: `apps/web/src/ui/LivePreviewPanel.tsx` (drop `as unknown`)

- [ ] **Step 1: Define `OpenApiDocument`**

In `packages/core/src/exporters/openapi.ts`:

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

Change the function signature: `export function toOpenApi(spec: Spec, opts?: { only?: CodegenSlice }): OpenApiDocument`.

The function body builds with `any` internally (the `doc`, `paths`, `op`, etc. variables stay `any`). At the return site, cast: `return doc as OpenApiDocument;`.

- [ ] **Step 2: Re-export from core**

Add to `packages/core/src/index.ts` near the existing `exporters/openapi` re-export:

```ts
export type { OpenApiDocument } from './exporters/openapi';
```

If the file already does `export * from './exporters/openapi';` (likely), no change needed — verify.

- [ ] **Step 3: Drop casts from web**

In `apps/web/src/ui/ExportPopover.tsx`, find every `as unknown` and `as { components?: ... }` at `toOpenApi(...)` call sites and remove them. The expressions become e.g.:

```ts
output: JSON.stringify(toOpenApi(spec, { only: { endpointIds: [ep.id] } }), null, 2),
```

```ts
const oas = toOpenApi(spec, { only: { typeKeys: [scope.typeKey] } });
const fragment = oas.components?.schemas?.[flatKey];
```

In `apps/web/src/ui/LivePreviewPanel.tsx`, drop the `as unknown` from the `toOpenApi(spec)` call.

- [ ] **Step 4: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/slice-2a-followups
pnpm install  # one-time if node_modules empty
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green. Existing 400 web tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/exporters/openapi.ts packages/core/src/index.ts apps/web/src/ui/ExportPopover.tsx apps/web/src/ui/LivePreviewPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(core): toOpenApi returns OpenApiDocument instead of any

Drops every `as unknown` / `as { components: ... }` cast in the web
consumers (ExportPopover, LivePreviewPanel). The function's internal
construction stays loosely typed; only the return boundary is
tightened.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Delete folder — store actions + UI wiring

**Files:**
- Modify: `apps/web/src/state/store.ts` — add `deleteEndpointFolder` + `deleteTypeFolder` actions.
- Modify: `apps/web/src/ui/EndpointList.tsx` — wire "Delete folder" MenuItem in `FolderRowMenu`.
- Modify: `apps/web/src/ui/TypePanel.tsx` — wire "Delete folder" MenuItem in its folder menu.
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — add `deleteFolderConfirm` + `deleteTypeFolderConfirm` + `deleteTypeFolderInUse` keys.
- Create: `apps/web/tests/state/store.deleteEndpointFolder.test.ts`
- Create: `apps/web/tests/state/store.deleteTypeFolder.test.ts`

- [ ] **Step 1: Store action — `deleteEndpointFolder`**

```ts
async deleteEndpointFolder(path) {
  const spec = get().spec;
  const inFolder = (folder?: string): boolean => folder === path || (folder?.startsWith(path + '/') ?? false);
  const removed = spec.endpoints.filter((e) => inFolder(e.folder));
  const next = { ...spec, endpoints: spec.endpoints.filter((e) => !inFolder(e.folder)) };
  await get().setSpec(next);
  if (get().selectedEndpointId && removed.some((e) => e.id === get().selectedEndpointId)) {
    set({ selectedEndpointId: null });
  }
  for (const e of removed) await clearEndpointHistory(e.id);
}
```

- [ ] **Step 2: Store action — `deleteTypeFolder`**

```ts
async deleteTypeFolder(path): Promise<{ ok: true } | { ok: false; reason: 'inUse'; usedBy: string[] }> {
  const spec = get().spec;
  const inFolder = (key: string): boolean => key === path || key.startsWith(path + '/');
  const removed = Object.keys(spec.types).filter(inFolder);
  if (removed.length === 0) return { ok: true };
  // Check for outside-folder references to any of the to-be-deleted keys.
  const usedBy: string[] = [];
  const refsInside = new Set(removed);
  // walk all types/endpoints NOT in the deleted set
  for (const [k, def] of Object.entries(spec.types)) {
    if (refsInside.has(k)) continue;
    if (referencesAnyOf(def, refsInside)) usedBy.push(`type ${k}`);
  }
  for (const ep of spec.endpoints) {
    if (endpointReferencesAnyOf(ep, refsInside)) usedBy.push(`endpoint ${ep.id}`);
  }
  if (usedBy.length > 0) return { ok: false, reason: 'inUse', usedBy };
  // Safe to delete
  const newTypes: Record<string, TypeDef> = {};
  for (const [k, v] of Object.entries(spec.types)) if (!refsInside.has(k)) newTypes[k] = v;
  const next = { ...spec, types: newTypes };
  await get().setSpec(next);
  return { ok: true };
}
```

`referencesAnyOf` and `endpointReferencesAnyOf` are small walkers over the schema (mirror the closure walker in `packages/core/src/codegen/closure.ts`'s `collectRefsFromType` / `collectRefsFromEndpoint` — those already exist; consider re-exporting them from `@zwaggen/core` if they aren't, then reuse).

- [ ] **Step 3: Update SpecStore interface**

Add to the `interface SpecStore`:

```ts
deleteEndpointFolder(path: string): Promise<void>;
deleteTypeFolder(path: string): Promise<{ ok: true } | { ok: false; reason: 'inUse'; usedBy: string[] }>;
```

- [ ] **Step 4: Wire EndpointList folder menu**

In `apps/web/src/ui/EndpointList.tsx` `FolderRowMenu`:

```tsx
const deleteEndpointFolder = useSpecStore((s) => s.deleteEndpointFolder);
const itemCount = useMemo(() => spec.endpoints.filter((e) => e.folder === node.path || e.folder?.startsWith(node.path + '/')).length, [spec.endpoints, node.path]);

<MenuItem
  danger
  onClick={(e) => {
    e.stopPropagation();
    if (!confirm(t('deleteFolderConfirm', { path: node.path, count: itemCount }))) return;
    void deleteEndpointFolder(node.path);
  }}
>
  {t('deleteFolder')}
</MenuItem>
```

(Pass `spec` down to `FolderRowMenu` if it doesn't already have it; or compute count via the existing `node.totalCount` — verify the FolderNode type has it.)

- [ ] **Step 5: Wire TypePanel folder menu**

Same shape in TypePanel's folder menu, but call `deleteTypeFolder` and surface the in-use Result via `alert`:

```tsx
const itemCount = /* count of types whose key is in this folder */;
<MenuItem danger onClick={async (e) => {
  e.stopPropagation();
  if (!confirm(t('deleteTypeFolderConfirm', { path: node.path, count: itemCount }))) return;
  const r = await deleteTypeFolder(node.path);
  if (!r.ok) alert(t('deleteTypeFolderInUse', { items: r.usedBy.join(', ') }));
}}>
  {t('deleteFolder')}
</MenuItem>
```

- [ ] **Step 6: i18n keys**

`en.json`:
```json
"deleteFolder": "Delete folder",
"deleteFolderConfirm": "Delete folder '{{path}}' and {{count}} endpoint(s) inside?",
"deleteTypeFolderConfirm": "Delete folder '{{path}}' and {{count}} type(s) inside?",
"deleteTypeFolderInUse": "Cannot delete: folder contents are referenced by {{items}}"
```

`zh-TW.json`:
```json
"deleteFolder": "刪除資料夾",
"deleteFolderConfirm": "刪除資料夾「{{path}}」與其中的 {{count}} 個端點？",
"deleteTypeFolderConfirm": "刪除資料夾「{{path}}」與其中的 {{count}} 個型別？",
"deleteTypeFolderInUse": "無法刪除：資料夾內容仍被 {{items}} 參考"
```

- [ ] **Step 7: Tests**

`apps/web/tests/state/store.deleteEndpointFolder.test.ts`:
```ts
test('removes all endpoints in folder + clears selection + clears history', async () => {
  // seed spec with endpoints in 'auth' folder and elsewhere; select one in 'auth';
  // call deleteEndpointFolder('auth'); assert remaining endpoints + selectedEndpointId null
});
test('matches subfolders too (auth deletes auth/oauth as well)', async () => { ... });
```

`apps/web/tests/state/store.deleteTypeFolder.test.ts`:
```ts
test('removes all types under folder when none are referenced from outside', async () => { ... });
test('returns ok:false with usedBy when an outside reference exists', async () => { ... });
test('internal cross-refs within the folder are fine', async () => { ... });
```

Update existing menu tests to verify the new "Delete folder" item appears.

- [ ] **Step 8: Verify + commit**

```bash
pnpm --filter web test
pnpm --filter web lint

git add apps/web/src/state apps/web/src/ui/EndpointList.tsx apps/web/src/ui/TypePanel.tsx apps/web/src/i18n/locales apps/web/tests/state
git commit -m "$(cat <<'EOF'
feat(web): Delete folder menu items + cascade store actions

EndpointList and TypePanel folder rows now have a Delete folder
item. Confirm prompt shows the item count. Type folder delete
aborts with an alert if any in-folder type is referenced from
outside the folder (mirrors the existing single-type in-use guard).

Closes the open follow-up from Slice 2A's code review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Duplicate — store actions + helper + UI wiring

**Files:**
- Create: `packages/core/src/schema/duplicateName.ts` — `nextAvailableTypeName`.
- Create: `packages/core/tests/schema/duplicateName.test.ts`.
- Modify: `packages/core/src/index.ts` — re-export `nextAvailableTypeName`.
- Modify: `apps/web/src/state/store.ts` — add `duplicateEndpoint` + `duplicateType`.
- Modify: `apps/web/src/ui/EndpointEditor.tsx` — activate Duplicate menu item.
- Modify: `apps/web/src/ui/EndpointList.tsx` — activate Duplicate menu item.
- Modify: `apps/web/src/ui/TypePanel.tsx` — activate Duplicate menu item.
- Create: `apps/web/tests/state/store.duplicate.test.ts`.

- [ ] **Step 1: `nextAvailableTypeName` (TDD)**

Write the test first:
```ts
test('returns Copy when base+Copy is free', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [] };
  expect(nextAvailableTypeName(s, 'User')).toBe('UserCopy');
});

test('cascades to Copy2, Copy3 on collisions', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [] };
  s.types['UserCopy'] = { kind: 'object', fields: [] };
  s.types['UserCopy2'] = { kind: 'object', fields: [] };
  expect(nextAvailableTypeName(s, 'User')).toBe('UserCopy3');
});

test('respects folder scope', () => {
  const s = emptySpec();
  s.types['auth/User'] = { kind: 'object', fields: [] };
  expect(nextAvailableTypeName(s, 'User', 'auth')).toBe('UserCopy');
  // Even though no top-level UserCopy exists, this call is folder-scoped:
  s.types['auth/UserCopy'] = { kind: 'object', fields: [] };
  expect(nextAvailableTypeName(s, 'User', 'auth')).toBe('UserCopy2');
  // A different folder doesn't collide
  expect(nextAvailableTypeName(s, 'User', 'public')).toBe('UserCopy');
});
```

Then implement:
```ts
import type { Spec } from './types';
import { joinKey } from './folders';

export function nextAvailableTypeName(spec: Spec, baseName: string, folder?: string): string {
  const exists = (n: string) => spec.types[joinKey(folder, n)] !== undefined;
  const candidate = `${baseName}Copy`;
  if (!exists(candidate)) return candidate;
  let i = 2;
  while (exists(`${baseName}Copy${i}`)) i++;
  return `${baseName}Copy${i}`;
}
```

- [ ] **Step 2: Store actions**

```ts
async duplicateEndpoint(id) {
  const spec = get().spec;
  const idx = spec.endpoints.findIndex((e) => e.id === id);
  if (idx < 0) return id;
  const newId = crypto.randomUUID();
  const copy = structuredClone(spec.endpoints[idx]!);
  copy.id = newId;
  const next = { ...spec, endpoints: [...spec.endpoints.slice(0, idx + 1), copy, ...spec.endpoints.slice(idx + 1)] };
  await get().setSpec(next);
  set({ selectedEndpointId: newId });
  return newId;
},

async duplicateType(key) {
  const spec = get().spec;
  const def = spec.types[key];
  if (!def) return key;
  const { folder, name } = splitKey(key);
  const newName = nextAvailableTypeName(spec, name, folder);
  const newKey = joinKey(folder, newName);
  // Insert after the source preserving order
  const newTypes: Record<string, TypeDef> = {};
  for (const [k, v] of Object.entries(spec.types)) {
    newTypes[k] = v;
    if (k === key) newTypes[newKey] = structuredClone(def);
  }
  const next = { ...spec, types: newTypes };
  await get().setSpec(next);
  return newKey;
}
```

Add to the `SpecStore` interface.

- [ ] **Step 3: UI wiring (3 surfaces)**

For each disabled `<MenuItem>` containing `t('duplicate')`:
- Drop the `disabled` prop.
- Drop the inline ` ({t('comingSoon')})` helper text (the menu item is now active; the helper text is misleading).
- Wire the `onClick` to call the store action.

EndpointEditor header (Duplicate the currently-open endpoint):
```tsx
<MenuItem onClick={async () => { await duplicateEndpoint(ep.id); }}>{t('duplicate')}</MenuItem>
```

EndpointList row:
```tsx
<MenuItem onClick={async (e) => { e.stopPropagation(); await duplicateEndpoint(endpoint.id); }}>{t('duplicate')}</MenuItem>
```

TypePanel row:
```tsx
<MenuItem onClick={async (e) => {
  e.stopPropagation();
  const newKey = await duplicateType(typeKey);
  // selection: TypePanel uses local `selected` state — call its setter via prop or context
}}>{t('duplicate')}</MenuItem>
```

Selection switch for type duplicate is up to the implementer: either pass a `setSelected` callback into the row, or rely on the existing `setSpec` reactivity to re-render and let the TypePanel's selection logic update naturally. If it's awkward, accept that the user has to click the new type — the duplicate exists in the list, that's the v1 win.

- [ ] **Step 4: Tests**

`apps/web/tests/state/store.duplicate.test.ts`:
```ts
test('duplicateEndpoint creates a fresh ID and inserts after the source', async () => { ... });
test('duplicateEndpoint deep-clones (mutating the copy does not affect the original)', async () => { ... });
test('duplicateType uses Copy suffix and preserves folder', async () => { ... });
test('duplicateType cascades to Copy2 on collision', async () => { ... });
test('duplicateType inserts after the source in spec.types insertion order', async () => { ... });
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/core test
pnpm --filter web test
pnpm --filter web build
pnpm --filter web lint

git add packages/core/src/schema/duplicateName.ts packages/core/src/index.ts packages/core/tests/schema/duplicateName.test.ts apps/web/src apps/web/tests/state/store.duplicate.test.ts
git commit -m "$(cat <<'EOF'
feat(web): Duplicate menu item — endpoints + types

Activates the Duplicate menu item on EndpointEditor header,
EndpointList rows, and TypePanel rows. Endpoint copy gets a fresh
UUID; type copy uses Copy / Copy2 / Copy3 ... via the new
nextAvailableTypeName helper in @zwaggen/core. Both deep-clone
and insert immediately after the source for visual proximity.

Closes the second open follow-up from Slice 2A's code review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Tick TODO + final smoke + move spec/plan

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Tick the Slice 2A follow-up entry**

Find:
```
- [ ] **Slice 2A follow-ups** (codegen-export-popover): (1) "Delete folder" menu item — needs decision on cascade-delete vs unfolderize semantics + new store action. (2) Implement Duplicate menu item (currently disabled placeholder). (3) Tighten `toOpenApi`'s return type from `any` to drop the `as unknown` cast in ExportPopover.
```

Replace with:
```
- [x] Slice 2A follow-ups (codegen-export-popover): cascade Delete folder on EndpointList + TypePanel folder rows (with confirm prompt + outside-reference guard for types); Duplicate activated on all 3 surfaces (endpoint UUID, type `Copy` suffix via `nextAvailableTypeName`); `toOpenApi` returns typed `OpenApiDocument` instead of `any`. See `docs/plans/done/2026-04-27-slice-2a-followups.md`.
```

Update "Last updated" stamp to `2026-04-27 (slice-2a-followups)`.

- [ ] **Step 2: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-27-slice-2a-followups.md docs/specs/done/
git mv docs/plans/active/2026-04-27-slice-2a-followups.md docs/plans/done/
```

- [ ] **Step 3: Final smoke**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship slice-2a-followups — tick TODO, move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 4 tasks ticked.
- `OpenApiDocument` defined; all `as unknown` / casts removed from web.
- 4 store actions added (`deleteEndpointFolder`, `deleteTypeFolder`, `duplicateEndpoint`, `duplicateType`) with tests.
- `nextAvailableTypeName` helper in core with unit tests.
- 5 UI surfaces wired (Delete folder × 2, Duplicate × 3).
- 4 i18n keys added in both locales.
- All tests + lint green.
- TODO entry ticked.
- Spec + plan moved to `done/`.
- Branch `plan/slice-2a-followups` ready to push.
