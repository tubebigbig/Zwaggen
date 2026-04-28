# Folder row "+" button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+" button to the LEFT of the 3-dot menu on EndpointList + TypePanel folder rows. Click → creates a new endpoint/type already inside that folder, then selects it.

**Architecture:** Two parallel UI changes — one for endpoints, one for types. Each adds a per-row "+" button using `IconPlus`, threads an `onAddEndpoint`/`onAddType` callback up to the panel root, and the root implements the actual add (mirroring the existing global `add()` / `addType()` helpers, plus `folder`).

**Tech Stack:** React, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-28-folder-row-add-button.md`. Constraints:

- "+" sits to the LEFT of the 3-dot menu, in the same hover-revealed group.
- New endpoint defaults match the existing `add()` (GET, /, etc.) plus `folder: node.path`.
- New type uses `NewType` / `NewType1` / `NewType2` auto-disambiguating in folder scope (mirrors `addType()`).
- "+" button uses `e.stopPropagation()` so clicking doesn't toggle folder collapse.

---

### Task 1: Endpoint folder row "+" button + tests

**Files:**
- Modify: `apps/web/src/ui/EndpointList.tsx` — wrap folder row's right-side area with a flex container holding the new "+" button + the existing `FolderRowMenu`. Thread `onAddEndpoint` callback up.
- Modify: `apps/web/src/i18n/locales/en.json` — add `addEndpointToFolder`.
- Modify: `apps/web/src/i18n/locales/zh-TW.json` — add `addEndpointToFolder`.
- Create: `apps/web/tests/ui/EndpointList.folderAdd.test.tsx` — 1 test.

- [ ] **Step 1: i18n key**

`en.json`:
```json
"addEndpointToFolder": "Add endpoint to this folder"
```

`zh-TW.json`:
```json
"addEndpointToFolder": "在此資料夾新增端點"
```

Place near other `add*` keys.

- [ ] **Step 2: `EndpointList` add helper**

In `apps/web/src/ui/EndpointList.tsx`, near the existing `add()` function (line 248), add:

```ts
async function addInFolder(folder: string) {
  const id = crypto.randomUUID();
  await setSpec({
    ...spec,
    endpoints: [...spec.endpoints, {
      id, method: 'GET', path: '/', pathParams: [],
      requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      folder,
    }],
  });
  select(id);
}
```

- [ ] **Step 3: Thread `onAddEndpoint` through the tree**

`onAddEndpoint?: (folder: string) => void` flows from `EndpointList` → `EndpointFolderTree` → `FolderTreeLevel` → `FolderTreeChild` (which renders folder rows). Add the prop at each level and pass it down. (Same pattern as the existing `onExport` / `onRenameFolder` threading.)

- [ ] **Step 4: Render the "+" button next to the folder menu**

In `FolderTreeChild`, wrap the existing `<FolderRowMenu>` in a flex container that also includes the new "+" button:

```tsx
<div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
  <button
    type="button"
    className="btn-icon"
    aria-label={t('addEndpointToFolder')}
    title={t('addEndpointToFolder')}
    onClick={(e) => { e.stopPropagation(); onAddEndpoint?.(node.path); }}
  >
    <IconPlus />
  </button>
  <FolderRowMenu
    node={node}
    onExport={onExport}
    onRename={() => { setBuffer(node.name); setEditing(true); }}
  />
</div>
```

(The existing `FolderRowMenu` already wraps itself in `opacity-0 group-hover:opacity-100`. After this change, the OUTER div handles hover visibility for both the + button and the menu — drop the inner `opacity-0 group-hover:opacity-100` on `FolderRowMenu` to avoid double-application. Verify by reading `FolderRowMenu`.)

`IconPlus` is exported from `apps/web/src/ui/icons.tsx` (already used in TypePanel.tsx and elsewhere).

- [ ] **Step 5: Tests**

`apps/web/tests/ui/EndpointList.folderAdd.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { EndpointList } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  const s = emptySpec();
  s.endpoints = [
    { id: 'a', method: 'GET', path: '/x', pathParams: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit', folder: 'auth' },
  ];
  await useSpecStore.getState().replaceSpec(s, null);
});

it('clicking + on a folder row creates a new endpoint in that folder and selects it', async () => {
  render(<EndpointList />);
  // The folder header is a button; locate it then climb to its row container.
  const folderHeader = screen.getByText('auth');
  const row = folderHeader.closest('.group') as HTMLElement;
  expect(row).not.toBeNull();
  const addBtn = within(row).getByRole('button', { name: /add endpoint to this folder/i });
  await userEvent.click(addBtn);

  const eps = useSpecStore.getState().spec.endpoints;
  expect(eps).toHaveLength(2);
  const newEp = eps.find((e) => e.id !== 'a')!;
  expect(newEp.folder).toBe('auth');
  expect(newEp.method).toBe('GET');
  expect(useSpecStore.getState().selectedEndpointId).toBe(newEp.id);
});
```

(If the row's `.group` class isn't the right selector, inspect the DOM and adjust. Goal: locate the "+" button INSIDE the same folder row, not at the panel header.)

- [ ] **Step 6: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/folder-row-add-button
pnpm install   # if node_modules empty
pnpm --filter web test
pnpm --filter web lint
```

Existing `EndpointList.folders.test.tsx` may need updates — its "rename via menu" tests query by row structure that just changed. Verify and fix if needed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/EndpointList.tsx apps/web/src/i18n/locales apps/web/tests/ui/EndpointList.folderAdd.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): folder rows show "+ Add endpoint" button next to the 3-dot menu

Click creates a new endpoint already inside that folder (folder
field set, defaults match the panel-header add). Removes the
"create then drag into folder" two-step. Visible on hover/focus-
within, matches the existing menu visibility pattern. stopPropagation
prevents triggering the folder's collapse toggle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Type folder row "+" button + tests

**Files:**
- Modify: `apps/web/src/ui/TypePanel.tsx`
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — add `addTypeToFolder`.
- Create: `apps/web/tests/ui/TypePanel.folderAdd.test.tsx`

- [ ] **Step 1: i18n key**

`en.json`: `"addTypeToFolder": "Add type to this folder"`
`zh-TW.json`: `"addTypeToFolder": "在此資料夾新增型別"`

- [ ] **Step 2: `TypePanel` add helper**

Near `addType()` (line 181):

```ts
async function addTypeInFolder(folder: string) {
  let name = 'NewType';
  let i = 1;
  while (spec.types[joinKey(folder, name)]) name = `NewType${i++}`;
  const key = joinKey(folder, name);
  await setSpec({ ...spec, types: { ...spec.types, [key]: { kind: 'object', fields: [] } } });
  setSelected(key);
}
```

`joinKey` is already imported at the top of TypePanel.tsx (used by other handlers).

- [ ] **Step 3: Thread `onAddType` through TypePanel's tree**

Mirror Task 1's threading pattern — pass `onAddType?: (folder: string) => void` from `TypePanel` down to `FolderRow`.

- [ ] **Step 4: Render the "+" button**

Same shape as Task 1 — wrap the existing `FolderRowMenu` in a flex container with the new "+" button on the left. Adjust visibility wrappers if `FolderRowMenu` had its own `opacity-0` (drop and lift to outer).

- [ ] **Step 5: Tests**

`apps/web/tests/ui/TypePanel.folderAdd.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { setUiPref } from '../../src/state/uiPrefs';

beforeEach(async () => {
  const s = emptySpec();
  s.types['auth/User'] = { kind: 'object', fields: [] };
  await useSpecStore.getState().replaceSpec(s, null);
  // Make sure the TypePanel slide-out is open
  setUiPref('typesCollapsed', false);
});

it('clicking + on a type folder row creates a new type in that folder and selects it', async () => {
  render(<TypePanel />);
  const folderHeader = screen.getByText('auth');
  const row = folderHeader.closest('.group') as HTMLElement;
  const addBtn = within(row).getByRole('button', { name: /add type to this folder/i });
  await userEvent.click(addBtn);

  const types = useSpecStore.getState().spec.types;
  const newKey = Object.keys(types).find((k) => k.startsWith('auth/') && k !== 'auth/User');
  expect(newKey).toBeDefined();
  expect(newKey).toMatch(/^auth\/NewType/);
});
```

- [ ] **Step 6: Verify**

```bash
pnpm --filter web test
pnpm --filter web lint
```

Existing TypePanel folder/dnd tests may need updates if they rely on row structure. Fix as needed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/TypePanel.tsx apps/web/src/i18n/locales apps/web/tests/ui/TypePanel.folderAdd.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): folder rows show "+ Add type" button next to the 3-dot menu

Same shape as the EndpointList commit. Click creates a new type
inside the folder with auto-disambiguating name (NewType / NewType1
/ NewType2 in folder scope). Selects the new type immediately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move spec/plan + final smoke

**Files:**
- Move: spec + plan to `done/`.

This slice doesn't tick a TODO line (it's a user-requested UX polish, not a tracked TODO).

- [ ] **Step 1: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-28-folder-row-add-button.md docs/specs/done/
git mv docs/plans/active/2026-04-28-folder-row-add-button.md docs/plans/done/
```

- [ ] **Step 2: Final smoke**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ship folder-row-add-button — move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- "+" button on both EndpointList + TypePanel folder rows, left of the 3-dot menu.
- Click creates a new item already inside the folder, selects it.
- 2 new i18n keys per locale (`addEndpointToFolder`, `addTypeToFolder`).
- 2 new tests pass.
- Existing tests still pass (any structural fixes documented).
- Spec + plan moved to `done/`.
- Branch `plan/folder-row-add-button` ready to push.
