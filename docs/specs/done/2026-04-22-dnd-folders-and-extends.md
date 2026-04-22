# Spec — Drag-and-drop for folders (TypePanel, EndpointList) and Extends reorder (TypeBuilder)

## Problem

Three TODO items currently require clunky text-input workarounds for intent that's naturally expressed with drag-and-drop:

1. **Drag-and-drop between folders in TypePanel and EndpointList** (deferred from the folders feature — v1 uses a text Folder input). Moving a type from `auth/User` to `billing/User` today means typing the destination path into a textbox; on a deep tree this is error-prone and breaks flow.

2. **Drag-reorder parents in the TypeBuilder Extends chip picker** (deferred from type-extension v1 — v1 uses remove + re-pick). Parent order matters (leftmost wins on merge conflicts), but today the only way to shuffle `[A, B, C]` → `[C, A, B]` is to remove A, remove B, then re-add them in the new order — destructive and slow.

3. Beyond the TODOs: both lists also lack **keyboard accessibility** for reorder/move. Screen-reader and keyboard-only users currently can't reorganize their spec at all except through the text-path workaround.

## Success criteria

- **TypePanel DnD.** The user can drag a type (by its row in the list) and drop it onto any folder header OR onto the root "ungrouped" zone. The type's `folder` field updates in the zustand store. If the destination is the current folder, nothing changes (no-op drop). `$ref`s to the moved type still resolve correctly because the rename side of the schema handles folder changes.
- **EndpointList DnD.** Same behaviour for endpoints: drop onto a folder header or root. `endpoint.folder` updates.
- **Extends chip reorder.** The user can drag a parent chip within the `ExtendsPicker` row and reorder it. `ObjectType.extends` updates to the new order. The first parent in the resulting array is the "leftmost" one (wins on merge conflict).
- **Keyboard accessibility.** For all three surfaces: focus the draggable item with Tab, press Space (or Enter) to grab, arrow keys to move the target, Space (or Enter) to drop, Escape to cancel. Announcements via aria-live so screen readers know what's happening. `@dnd-kit` provides this for free with its Sortable + KeyboardSensor setup — we use it rather than rolling our own.
- **Visual feedback during drag.** Drop zones highlight when a valid drop is hovered; invalid targets don't. The dragged item gets a subtle ghost/elevation. Nothing fancy — match the existing visual density.
- **Unit tests** cover store mutation correctness on each drop (not the DOM DnD semantics — those are covered by e2e). Mock or simulate `onDragEnd` to assert store state.
- **Playwright e2e tests** cover the three DnD paths with real pointer events (or keyboard DnD, which is more stable in headless). Extend the existing `apps/web/e2e/folders.spec.ts` for TypePanel + EndpointList, and `apps/web/e2e/extends.spec.ts` for the chip picker.
- **No regression** in any existing test. No new act warnings.
- **Docs updated** (English + zh-TW):
  - `apps/docs/guide/folders.md`: mention that folder assignment supports drag-and-drop as an alternative to the Folder text input.
  - `apps/docs/guide/type-inheritance.md`: mention that parent chips can be reordered by drag.
  - zh-TW counterparts mirror.
- **Three TODO items ticked** (two Feature items + one Follow-up item).

## Out of scope

- Reorder within a folder (alphabetical ordering is currently preserved by the store; exposing manual ordering within a folder would require a new `position` field, a schema bump, and additional UI — defer to a follow-up).
- Drag between TypePanel and EndpointList (types can't become endpoints; cross-panel drag has no semantics).
- Touch device optimization beyond `@dnd-kit`'s `PointerSensor` default behaviour. Works on touch, but no custom gestures like long-press-to-initiate.
- Drop-zone auto-scroll when dragging near the viewport edge. `@dnd-kit` has `AutoScroll` modifier but it needs wiring — deferred.
- Reordering folders themselves (collapsing the folder tree, moving whole subtrees). Only items within folders are draggable.
- Animations beyond `@dnd-kit` defaults. No custom spring physics, no reorder-transition polish.
- "Effective-shape preview panel in TypeBuilder" TODO — unrelated to DnD, separate plan.

## Approach

### Library choice

`@dnd-kit/core` + `@dnd-kit/sortable`. Modern, tree-shakeable (~13KB combined), accessible by default, maintained, TS-first. Chosen over `react-dnd` (older, heavier, HTML5-API-coupled) and native HTML5 drag events (poor keyboard/touch story). Pins current major (`^6` for core, `^8` for sortable) to match React 18.

Install as `dependencies` on `apps/web` (ships in the production bundle).

### Architecture

Each DnD surface gets its own `DndContext` — not one big app-wide context. That means:

- `TypePanel.tsx` wraps its list in a local `DndContext`; types are `useSortable`-bound rows inside `SortableContext`; folder headers are `useDroppable`-bound drop zones; the root zone is another droppable. `onDragEnd` calls a store action like `setTypeFolder(typeKey, newFolder | null)`.
- `EndpointList.tsx` wraps its list identically for endpoints; `onDragEnd` → `setEndpointFolder(endpointId, newFolder | null)`.
- `ExtendsPicker` (inside `TypeBuilder.tsx`) wraps its chip row in a local `DndContext` + `SortableContext` with horizontal strategy; `onDragEnd` reorders the `extends` array via `arrayMove`.

Three contexts keeps concerns isolated and avoids cross-surface collision edge cases.

### Store actions

Two new thin actions in `apps/web/src/state/store.ts` (piggy-back on the existing `setSpec`; no new schema surface since folder fields already exist):

```ts
setTypeFolder: (typeKey: string, folder: string | null) => Promise<void>
setEndpointFolder: (endpointId: string, folder: string | null) => Promise<void>
```

For Extends reorder, use the existing mechanism: `onChange({ ...value, extends: reordered })` is already how the chip picker talks to the parent. No store change needed.

### Tests

- **Unit** (vitest): 3 tests per surface asserting `onDragEnd(event)` → store matches expected. We can mock drag events as plain objects `{ active: { id: '...' }, over: { id: '...' } }` and call the handler directly.
- **e2e** (Playwright): use `locator.dragTo(other)` in `apps/web/e2e/folders.spec.ts` and `extends.spec.ts`. Prefer keyboard DnD for stability where possible: focus the source, press Space, press ArrowDown/Up, press Space to drop.

### Risks

- **Keyboard vs pointer parity**: @dnd-kit handles both, but e2e tests must exercise at least one. Start with keyboard (most stable in headless), add one pointer test per surface if time permits.
- **Unit test mocking**: @dnd-kit doesn't fire real DOM drag events; we test the reducers/handlers, not the library internals. This is a correct scope choice (we don't own the library).
- **Folder header reachability**: today's TypePanel may render folder headers only when a folder has contents. If the user tries to drag a type OUT of the only folder into a new empty folder, there's no target. Treat this as out-of-scope: the user can still use the Folder text input to create an empty destination; or use root. The DnD is a convenience, not a replacement.
