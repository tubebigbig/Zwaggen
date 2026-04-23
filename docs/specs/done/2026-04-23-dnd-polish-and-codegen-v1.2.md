# Spec — DnD polish bundle + Codegen v1.2

## Problem

Five concrete polish items from prior code reviews have been sitting in TODO since the DnD-folders feature shipped (2026-04-22) and the codegen v1.1 review (today). All are small, all are quality-of-life. Bundling them into one slice keeps the cadence and avoids one PR per nit.

The five items:

1. **Codegen v1.2 — `zodTypeExpr` inline-object expansion (response side).** v1.1 fixed the input side (client method input types now expand inline objects instead of falling through to `unknown`); the response-parser side still emits `z.array(z.unknown())` for `{ kind: 'array', element: { kind: 'object', ... } }`. Mirror the fix.

2. **DnD: zh-TW screen-reader announcements.** `@dnd-kit` ships English-only default announcements (grab/move/drop/cancel). When the UI is in zh-TW, announcements stay English. Pass a localized `announcements` prop to each `DndContext` in TypePanel, EndpointList, and ExtendsPicker.

3. **DnD: sentinel collision risk.** `TYPE_PANEL_ROOT_ID = '__root__'` and `ENDPOINT_LIST_ROOT_ID = '__root__'` could collide with a user-created folder literally named `__root__` — `isValidSegment` accepts `__root__` (regex `/^[A-Za-z0-9_. -]+$/` includes underscore). Switch the sentinels to a value `isValidSegment` rejects (e.g. `$$ROOT$$` — `$` is not in the allowed set).

4. **DnD: `setTypeFolder` silent no-op.** When a DnD drop lands on a destination folder that already contains a type with the same name, the store's `setTypeFolder` returns silently. The user sees the dragged row snap back with no feedback — looks like the drop "didn't take." Surface a user-visible message (inline + aria-live), and add a unit test for the collision branch.

5. **DnD: keyboard-DnD e2e coverage.** v1 ships pointer-only e2e because keyboard-DnD needed more Playwright plumbing. Pointer-DnD is fragile against viewport scaling and scrolled lists. Add at least one keyboard-DnD path (Space → Arrow keys → Space sequence) on TypePanel or EndpointList to lock in the accessibility flow.

## Success criteria

### Codegen v1.2

- `zodTypeExpr` (in `packages/cli/src/generate/client.ts`) gains an `'object'` case that recurses into `z.object({ ... })`, mirroring the existing `tsRefType` pattern. Empty objects emit `z.object({})`.
- An array-of-inline-object response shape generates `z.array(z.object({ ... }))` instead of `z.array(z.unknown())`.
- New test fixture / assertion exercises the new path.
- Existing v1 + v1.1 codegen tests pass unchanged.

### DnD: zh-TW announcements

- A localized `announcements` config is supplied to each `DndContext` in TypePanel, EndpointList, and ExtendsPicker.
- Announcement strings live in `apps/web/src/i18n/locales/{en,zh-TW}.json` under a `dnd` namespace (or flat keys with `dnd` prefix). Six keys: `dndAnnounceGrab`, `dndAnnounceMoveOver`, `dndAnnounceMoveCancel`, `dndAnnounceDrop`, `dndAnnounceDropCancel`, `dndAnnounceMoveOverNothing`. Match the upstream `defaultAnnouncements` API shape.
- When the active locale is zh-TW, the announcements render in zh-TW; for en (default) they keep current behaviour.
- A unit test asserts the resolved `announcements` prop returns localized strings for the right locale.

### DnD: sentinel collision

- `TYPE_PANEL_ROOT_ID` and `ENDPOINT_LIST_ROOT_ID` change from `'__root__'` to `'$$ROOT$$'` (or another value `isValidSegment` rejects). A unit test asserts `isValidSegment(TYPE_PANEL_ROOT_ID) === false`.
- All call sites that compare against the constant continue to work (they already use the imported constant — no string-literal duplication).
- A regression test creates a spec with a folder literally named `__root__` and verifies DnD still treats it as a real folder, not the root sentinel.

### DnD: setTypeFolder feedback

- When `setTypeFolder` (or the symmetric `setEndpointFolder`) detects a collision (target key already exists), it surfaces user-visible feedback. Implementation: a small inline alert/banner near the dragged row, OR a transient toast. Either works; the implementer picks the lighter touch. Whatever is chosen must be screen-reader-accessible (`role="alert"` + aria-live polite).
- The store action returns `{ ok: true }` on success and `{ ok: false; reason: 'collision' }` on no-op so the UI knows when to surface feedback. (Or a parallel mechanism — implementer's call.)
- A unit test asserts the collision branch fires the feedback hook / returns the right shape.
- An existing or new collision unit test covers both `setTypeFolder` and `setEndpointFolder`.

### DnD: keyboard e2e

- A new Playwright e2e test exercises keyboard-DnD on at least ONE of TypePanel, EndpointList, ExtendsPicker. Sequence: Tab to focus draggable, Space to grab, ArrowDown N times to move target, Space to drop. Final assertion: the dropped item ends up in the new position.
- Lives alongside the existing pointer e2e (`apps/web/e2e/folders.spec.ts` or a new file).
- Pointer e2e tests stay; keyboard one is additive.

### Cross-cutting

- TODO entries ticked (4 DnD + 1 codegen).
- Existing test suites stay green: `@zwaggen/core` + `@zwaggen/web` + `@zwaggen/cli` + `@zwaggen/desktop`.
- Spec + plan moved to `done/`.
- Branch `plan/dnd-polish-and-codegen-v1.2` pushed.

## Out of scope

- **DnD between TypePanel and EndpointList.** Cross-panel drag has no semantics (types can't become endpoints). Stays out per prior spec.
- **Reorder within a folder.** Alphabetical ordering preserved by store; manual ordering needs a `position` field. Out.
- **Codegen v1.3 / v2.** This slice is the smallest possible v1.2 — only the symmetric zod fix.
- **Drag-to-create-folder, multi-select drag, undo/redo for moves.** All separate features.
- **Touch-device DnD polish beyond `@dnd-kit`'s `PointerSensor` defaults.**
- **Toast component infrastructure.** Use the simplest screen-reader-accessible thing that works (aria-live region + visible badge). No new component library.

## Approach

### Codegen v1.2

In `packages/cli/src/generate/client.ts`, find `zodTypeExpr`. Today:

```ts
function zodTypeExpr(def: TypeDef): string {
  switch (def.kind) {
    case 'string': return 'z.string()';
    case 'number':
    case 'integer': return 'z.number()';
    case 'boolean': return 'z.boolean()';
    case 'ref': return `${sanitizeFolderKey(def.ref)}Schema`;
    case 'array': return `z.array(${zodTypeExpr(def.element)})`;
    default: return 'z.unknown()';   // <-- bug
  }
}
```

Add the object case (mirror `tsRefType`):

```ts
case 'object': {
  if (def.fields.length === 0) return 'z.object({})';
  const fields = def.fields.map((f) => {
    const inner = zodTypeExpr(f.type);
    const tail = f.required ? '' : '.optional()';
    return `${JSON.stringify(f.name)}: ${inner}${tail}`;
  }).join(', ');
  return `z.object({ ${fields} })`;
}
```

### DnD: zh-TW announcements

`@dnd-kit/core` exports `defaultAnnouncements` of shape:

```ts
type Announcements = {
  onDragStart(args: { active: { id: string } }): string;
  onDragOver(args: { active: { id: string }; over?: { id: string } | null }): string;
  onDragEnd(args: { active: { id: string }; over?: { id: string } | null }): string;
  onDragCancel(args: { active: { id: string } }): string;
};
```

(or similar — confirm by reading `@dnd-kit/core`'s types).

Create `apps/web/src/ui/dndAnnouncements.ts`:

```ts
import { useTranslation } from 'react-i18next';

export function useDndAnnouncements() {
  const { t } = useTranslation();
  return {
    onDragStart({ active }: { active: { id: string } }) { return t('dndAnnounceGrab', { id: active.id }); },
    onDragOver({ active, over }: { active: { id: string }; over?: { id: string } | null }) {
      return over ? t('dndAnnounceMoveOver', { id: active.id, over: over.id }) : t('dndAnnounceMoveOverNothing', { id: active.id });
    },
    onDragEnd({ active, over }: { active: { id: string }; over?: { id: string } | null }) {
      return over ? t('dndAnnounceDrop', { id: active.id, over: over.id }) : t('dndAnnounceDropCancel', { id: active.id });
    },
    onDragCancel({ active }: { active: { id: string } }) { return t('dndAnnounceMoveCancel', { id: active.id }); },
  };
}
```

Each `DndContext` in TypePanel / EndpointList / ExtendsPicker takes `accessibility={{ announcements: useDndAnnouncements() }}`.

i18n keys (en):
```json
"dndAnnounceGrab": "Picked up {{id}}.",
"dndAnnounceMoveOver": "{{id}} is over {{over}}.",
"dndAnnounceMoveOverNothing": "{{id}} is no longer over a droppable area.",
"dndAnnounceDrop": "{{id}} was dropped over {{over}}.",
"dndAnnounceDropCancel": "{{id}} was dropped.",
"dndAnnounceMoveCancel": "Dragging was cancelled. {{id}} returned to its original position."
```

zh-TW:
```json
"dndAnnounceGrab": "已選取 {{id}}。",
"dndAnnounceMoveOver": "{{id}} 在 {{over}} 上方。",
"dndAnnounceMoveOverNothing": "{{id}} 不在任何可放置區域上方。",
"dndAnnounceDrop": "已將 {{id}} 放到 {{over}}。",
"dndAnnounceDropCancel": "{{id}} 已放下。",
"dndAnnounceMoveCancel": "已取消拖曳。{{id}} 回到原位。"
```

### DnD: sentinel collision

Two-line change in TypePanel + EndpointList:

```ts
export const TYPE_PANEL_ROOT_ID = '$$ROOT$$';     // was '__root__'
```

```ts
export const ENDPOINT_LIST_ROOT_ID = '$$ROOT$$';  // was '__root__'
```

Both can share the same value (`$$ROOT$$`) — they're scoped per `DndContext` so cross-panel collision isn't possible.

Regression test:

```ts
test('isValidSegment rejects the DnD root sentinel', () => {
  expect(isValidSegment(TYPE_PANEL_ROOT_ID)).toBe(false);
  expect(isValidSegment(ENDPOINT_LIST_ROOT_ID)).toBe(false);
});

test('a folder literally named __root__ is not confused with the DnD root sentinel', () => {
  // build spec with a type in folder '__root__'
  // simulate a drop onto the root sentinel ('$$ROOT$$')
  // assert the type's folder becomes undefined (root), not '__root__'
});
```

### DnD: setTypeFolder feedback

Today (`apps/web/src/state/store.ts`):

```ts
async setTypeFolder(typeKey, folder) {
  const spec = get().spec;
  if (!spec.types[typeKey]) return;
  const { name } = splitKey(typeKey);
  const newFolder = folder ?? undefined;
  const newKey = joinKey(newFolder, name);
  if (newKey === typeKey) return;
  if (spec.types[newKey]) return; // collision: silently no-op.   <-- this
  const next = renameType(spec, typeKey, newKey);
  await get().setSpec(next);
},
```

Change the signature to return a status:

```ts
async setTypeFolder(typeKey: string, folder: string | null): Promise<{ ok: boolean; reason?: 'unknown' | 'noop' | 'collision' }> {
  const spec = get().spec;
  if (!spec.types[typeKey]) return { ok: false, reason: 'unknown' };
  const { name } = splitKey(typeKey);
  const newFolder = folder ?? undefined;
  const newKey = joinKey(newFolder, name);
  if (newKey === typeKey) return { ok: false, reason: 'noop' };
  if (spec.types[newKey]) return { ok: false, reason: 'collision' };
  const next = renameType(spec, typeKey, newKey);
  await get().setSpec(next);
  return { ok: true };
}
```

Same shape for `setEndpointFolder`.

In TypePanel / EndpointList, the DnD `onDragEnd` handler now:

```tsx
const result = await setTypeFolder(active.id, dest);
if (!result.ok && result.reason === 'collision') {
  setDndAlert(t('dndCollisionMessage', { name: splitKey(active.id).name, folder: dest ?? '/' }));
  // auto-clear after 4s
}
```

Render at the bottom of the panel:

```tsx
{dndAlert && (
  <div role="alert" aria-live="polite" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
    {dndAlert}
  </div>
)}
```

i18n key:
- en: `"dndCollisionMessage": "Can't move \"{{name}}\" to {{folder}} — a type with that name already exists there."`
- zh-TW: `"dndCollisionMessage": "無法將「{{name}}」移到 {{folder}} — 該位置已有同名型別。"`

### DnD: keyboard e2e

In `apps/web/e2e/folders.spec.ts` (or new `keyboard-dnd.spec.ts`):

```ts
test('keyboard-DnD: move a type from root to a folder', async ({ page }) => {
  // load fixture with a type named 'A' at root and a folder 'b' with one type
  // page.keyboard:
  //   Tab Tab Tab ... until the 'A' row is focused (verify with page.evaluate(() => document.activeElement?.textContent))
  //   Space (grab) — assert aria-live announcement
  //   ArrowDown N times until the 'b' folder header is the over-target
  //   Space (drop)
  // assert the spec store now has 'A' in folder 'b'
});
```

Use `page.evaluate` to inspect store state (the existing e2e tests probably have a helper for this — check `apps/web/e2e/_helpers.ts` or similar).

If keyboard-DnD proves too gnarly under headless Playwright (focus management, scrolling), document the workaround in the test file and skip — but try first.

### Risks

- **`setTypeFolder` signature change ripples** to every caller. Check all `await setTypeFolder(...)` sites (probably ~3-5). If any throw away the result, leave them alone — the new return type is `Promise<{...}>` which TypeScript widens cleanly.
- **`@dnd-kit` Announcements API**: confirm the actual prop name is `accessibility.announcements` (not `announcements` directly) — varies by version. The package versions pin in `apps/web/package.json` are authoritative.
- **i18n key flood**: 7 new keys (6 announcements + 1 collision). Acceptable; the panel guides already have many.
- **Regression test for `__root__` folder**: verify `isValidSegment('__root__')` returns `true` first (so the test confirms the underlying gap exists). Then the regression test for sentinel switch proves the fix.
- **Keyboard e2e flakiness**: focus stepping with Tab is fragile across UI layout changes. Use a more direct approach — `page.locator('[data-testid="row-A"]').focus()` then keyboard sequence.
- **Toast vs inline**: chose inline (no new infra). If user demand grows for transient notifications, can add a toast layer later.

## Done definition

- All 5 items above ship with their tests.
- TODO entries ticked: codegen v1.2 + 4 DnD polish items.
- All package test suites green.
- Spec + plan moved to `done/`.
- Branch pushed; user opens PR (base = `main`).
