# Plan — DnD for folders (TypePanel, EndpointList) + Extends reorder

Spec: `docs/specs/active/2026-04-22-dnd-folders-and-extends.md`.

Execute on branch `plan/dnd-folders-and-extends` in `.worktrees/dnd-folders-and-extends`. **All git ops inside the worktree.** Six commits (deps, TypePanel, EndpointList, Extends, e2e, docs) + one archive commit.

## Tasks

### 1. Install `@dnd-kit` + scaffold shared keyboard-announcement

**Action:**
```bash
cd /Users/victorliang/Zwaggen/.worktrees/dnd-folders-and-extends
pnpm --filter web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/accessibility
```

Pin to the versions pnpm resolves. These land in `apps/web/package.json` as `dependencies`.

**Verify:**
```bash
pnpm --filter web exec tsc -b
pnpm --filter web test
```

Both must stay green before touching any component code. Commit:

```
chore(web): add @dnd-kit (core, sortable, modifiers, accessibility) as deps

Staging dependency for DnD on TypePanel, EndpointList, and
TypeBuilder's Extends chip picker. Next commits wire it in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 2. TypePanel — drag types between folders

**Files:**
- `apps/web/src/ui/TypePanel.tsx` — wrap the type list section in a `DndContext`; make each type row a `useSortable`-bound draggable; make folder headers + the root "ungrouped" section `useDroppable` drop zones.
- `apps/web/src/state/store.ts` — add `setTypeFolder(typeKey, folder | null)` action. Body: compute the renamed canonical key (folder-prefixed or unprefixed), call the existing `renameType` helper from `@zwaggen/core/schema/rename` so `$ref` callers are updated too.

Behaviour:
- Source = a type row (id = canonical key like `auth/User`).
- Target = a folder header (id = folder name like `auth`) OR root zone (id = `__root__`).
- `onDragEnd(event)`: if `over?.id` is a folder id, compute `newKey = over.id + '/' + shortName(active.id)`; if `over?.id === '__root__'`, `newKey = shortName(active.id)`. If `newKey === active.id`, no-op. Otherwise call `setTypeFolder(active.id, folder | null)`.
- Drop-zone highlight: `isOver && canDrop` → `ring-2 ring-brand-400` on the header.
- Keyboard: `KeyboardSensor` enabled by default. Space to grab, arrow keys to move between folders, Space to drop, Escape to cancel.

Restrictions (enforce in `onDragOver` or by disabling certain droppables):
- Can't drop a type onto itself.
- Can't drop onto a folder it's already in (no-op; but don't show false highlight).

Verify:
```bash
pnpm --filter web test tests/ui/TypePanel.folders.test.tsx
pnpm --filter web test 2>&1 | tee /tmp/dnd-type.log
grep -cE "An update to|wrapped in act" /tmp/dnd-type.log
pnpm --filter web exec tsc -b
```

Add a new unit test `apps/web/tests/ui/TypePanel.dnd.test.tsx` that:
- Seeds a spec with `types: { 'auth/User': ..., 'billing/Invoice': ... }`.
- Renders `<TypePanel />` inside a test `<DndContext>` wrapper.
- Invokes the handler (exposed via a hook or test-only export) with a synthetic `DragEndEvent { active: { id: 'auth/User' }, over: { id: 'billing' } }`.
- Asserts the store now has `types: { 'billing/User': ..., 'billing/Invoice': ... }`.
- Second case: drop onto `__root__` → key becomes `User`.
- Third case: drop onto the same folder → no-op.

Commit:
```
feat(web): DnD types between folders in TypePanel

Each type row is a @dnd-kit sortable draggable; folder headers and
the root "ungrouped" section are drop zones. onDragEnd calls a new
store action setTypeFolder that renames the canonical key and
updates inbound $refs via the existing renameType helper. Keyboard-
accessible by default (Space grab, arrows move, Space drop, Esc
cancel).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 3. EndpointList — drag endpoints between folders

**Files:**
- `apps/web/src/ui/EndpointList.tsx` — mirror the TypePanel pattern with a local `DndContext`.
- `apps/web/src/state/store.ts` — add `setEndpointFolder(endpointId, folder | null)` action. Body: find the endpoint by id, update its `folder` field. Much simpler than types (no $ref rewriting).

Behaviour identical to TypePanel but simpler: the `Endpoint.folder` field is a plain string, no canonical-key rewriting needed.

Test file: `apps/web/tests/ui/EndpointList.dnd.test.tsx` — three cases mirroring TypePanel.dnd's shape.

Verify + commit:
```
feat(web): DnD endpoints between folders in EndpointList

Mirrors TypePanel's DnD pattern: endpoint rows are sortable
draggables, folder headers are drop zones, onDragEnd updates
endpoint.folder via a new setEndpointFolder store action. No
$ref rewrite needed for endpoints.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 4. Extends chip reorder in TypeBuilder's `ExtendsPicker`

**File:** `apps/web/src/ui/TypeBuilder.tsx` — the `ExtendsPicker` component around lines 537–644.

Wrap the `parents.map(...)` row in a `DndContext` + `SortableContext` with `horizontalListSortingStrategy`. Each parent chip becomes a `useSortable` item. The existing remove-button stays. Drag to reorder horizontally. `onDragEnd`:

```ts
if (over && active.id !== over.id) {
  const oldIndex = parents.indexOf(active.id as string);
  const newIndex = parents.indexOf(over.id as string);
  const reordered = arrayMove(parents, oldIndex, newIndex);
  onChange({ ...value, extends: reordered });
}
```

Visual: when dragging, the chip gets `opacity-50` and a subtle drop-shadow; the destination slot expands to show where it'll land (default @dnd-kit behaviour via `CSS.Transform.toString(transform)`).

Keyboard: Space/Enter to grab, ArrowLeft/ArrowRight to move, Space to drop, Escape to cancel.

Test file: `apps/web/tests/ui/TypeBuilder.extendsReorder.test.tsx` with three cases:
- Reorder `[A, B, C]` → `[B, A, C]` by simulating `onDragEnd({ active: { id: 'A' }, over: { id: 'B' } })`.
- No-op when active and over are the same id.
- Order persists through a re-render (the store update should feed back into the component).

Commit:
```
feat(web): DnD reorder in ExtendsPicker chip row

Drag parents left/right to reorder. Leftmost wins on merge conflict
(existing resolver semantics, unchanged). Keyboard-accessible via
@dnd-kit's default sensors. v1 was remove-then-re-pick; this replaces
that workaround with direct manipulation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 5. Playwright e2e coverage

**Files:**
- Extend `apps/web/e2e/folders.spec.ts` with two new tests (one TypePanel DnD path, one EndpointList DnD path).
- Extend `apps/web/e2e/extends.spec.ts` with one new test for chip reorder.

For each new test, prefer KEYBOARD DnD (more stable headless):
1. Seed spec via `page.evaluate(() => useSpecStore.setState(...))` or the existing test-setup helper.
2. Tab / click into the source item.
3. Press `Space` to grab.
4. Press `ArrowDown` (or `ArrowRight` for horizontal) N times.
5. Press `Space` to drop.
6. Assert the store reflects the new position (via another `page.evaluate`).

If keyboard DnD produces flaky results in the first run, fall back to `source.dragTo(destination)` for pointer DnD.

Run:
```bash
pnpm --filter web e2e 2>&1 | tee /tmp/dnd-e2e.log
```

All e2e tests must pass. If a new test is flaky, stabilize before committing — add waits on the mutation to settle (e.g., `await page.waitForFunction(() => useSpecStore.getState().spec.types['billing/User'])`). Don't commit a flaky test.

Commit:
```
test(web-e2e): cover DnD folder moves and Extends chip reorder

Three new Playwright tests (TypePanel, EndpointList, ExtendsPicker)
use keyboard DnD where possible for headless stability. Each test
asserts the store mutation post-drop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 6. Docs — mention DnD in folders + type-inheritance guides

**Files:**
- `apps/docs/guide/folders.md` — add a one-paragraph section "Drag-and-drop" after the existing Folder input section; mention keyboard DnD (Space to grab, arrows to move, Space to drop).
- `apps/docs/zh-TW/guide/folders.md` — mirror in zh-TW.
- `apps/docs/guide/type-inheritance.md` — add one line near the "Parents" section mentioning that chips can be drag-reordered.
- `apps/docs/zh-TW/guide/type-inheritance.md` — mirror in zh-TW.

Keep the doc additions short (a few sentences each). No screenshots needed for v1 — the interaction is discoverable from the behaviour.

Commit:
```
docs(guide): mention DnD for folders and Extends reorder (en + zh-TW)

Folders guide: short paragraph on drag-and-drop as an alternative to
the Folder text input, with keyboard DnD shortcuts.
Type-inheritance guide: one line on drag-reorder of parent chips.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 7. Archive + tick TODO

One commit inside the worktree:

- `git mv docs/specs/active/2026-04-22-dnd-folders-and-extends.md docs/specs/done/`
- `git mv docs/plans/active/2026-04-22-dnd-folders-and-extends.md docs/plans/done/`

In `docs/TODO.md`, flip THREE lines to `[x]`:

Under `## Feature`:
```
- [ ] Drag-and-drop between folders in TypePanel and EndpointList (deferred from the folders feature — v1 uses a text Folder input).
- [ ] Drag-reorder parents in the TypeBuilder Extends chip picker (deferred from type-extension v1 — v1 uses remove + re-pick).
```
→
```
- [x] Drag-and-drop between folders in TypePanel and EndpointList — see `docs/plans/done/2026-04-22-dnd-folders-and-extends.md`.
- [x] Drag-reorder parents in the TypeBuilder Extends chip picker — see `docs/plans/done/2026-04-22-dnd-folders-and-extends.md`.
```

Bump `Last updated:` to `2026-04-22 (dnd-folders-and-extends)`.

Commit:
```
docs: ship dnd-folders-and-extends — move spec+plan to done, tick TODOs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Execution strategy

Six implementer commits (tasks 1–6) dispatched as ONE implementer subagent — the tasks share the @dnd-kit setup and some patterns, so context reuse helps. If the subagent stalls or the full job feels too large, it should report DONE_WITH_CONCERNS after completing the first N tasks and the master session can dispatch a continuation subagent for the remaining tasks.

After DONE:
- Spec-compliance review (one subagent).
- Code-quality review (one subagent).
- Archive subagent for task 7.
- Master FF-merges and pushes.

## Notes for the implementer

- `@dnd-kit/core` exposes `DndContext`, `useDraggable`, `useDroppable`, `DragEndEvent`, `DragOverlay`, `KeyboardSensor`, `PointerSensor`, `useSensors`, `useSensor`.
- `@dnd-kit/sortable` exposes `SortableContext`, `useSortable`, `arrayMove`, `sortableKeyboardCoordinates`, `horizontalListSortingStrategy`, `verticalListSortingStrategy`.
- The common React pattern:

```tsx
import { DndContext, useSensor, useSensors, PointerSensor, KeyboardSensor, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners}>{children}</div>;
}

function List({ items, onDragEnd }: { items: string[]; onDragEnd: (e: DragEndEvent) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map((id) => <SortableItem key={id} id={id}>{id}</SortableItem>)}
      </SortableContext>
    </DndContext>
  );
}
```

Adapt for horizontal in ExtendsPicker (`horizontalListSortingStrategy`) and for the folder-header drop targets in TypePanel/EndpointList (`useDroppable` on the header).
