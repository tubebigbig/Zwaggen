# Folder row "+ folder" button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `+ folder` button on every EndpointList + TypePanel folder row, between the existing `+ Add type/endpoint` button and the ⋯ 3-dot menu. Click sets the panel's `creatingBuffer` to `'{parent.path}/'` so the existing NewFolderRow input appears with the prefix pre-filled.

**Architecture:** Two parallel UI changes. Each adds a per-row button using `IconFolderPlus`, threads an `onAddSubfolder` callback up to the panel, and the panel implements `setCreatingBuffer('{path}/')`.

**Tech Stack:** React, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-28-folder-row-add-subfolder.md`.

---

### Task 1: EndpointList — `+ folder` button + test

**Files:**
- Modify: `apps/web/src/ui/EndpointList.tsx` — add button to FolderTreeChild, thread `onAddSubfolder` callback up, panel-level handler.
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — add `addSubfolder`.
- Modify: `apps/web/tests/ui/EndpointList.folderAdd.test.tsx` — add 1 test.

- [ ] **Step 1: i18n keys**

`en.json`:
```json
"addSubfolder": "Add subfolder"
```

`zh-TW.json`:
```json
"addSubfolder": "新增子資料夾"
```

Place near the existing `addEndpointToFolder` key.

- [ ] **Step 2: Panel handler + threading**

In `EndpointList`, add a small handler:

```ts
function startSubfolder(parentPath: string): void {
  setCreatingBuffer(`${parentPath}/`);
}
```

Add `onAddSubfolder?: (parentPath: string) => void` prop to:
- `EndpointFolderTree`
- `FolderTreeLevel`
- `FolderTreeChild`

Thread it through the existing tree (mirror the existing `onAddEndpoint` / `onExport` threading).

In the top-level body, pass `onAddSubfolder={startSubfolder}` down to `EndpointFolderTree`.

- [ ] **Step 3: Render the button**

In `FolderTreeChild`, find the existing flex wrapper that holds the `+` (add endpoint) button and the `<FolderRowMenu>`. Insert the new `+ folder` button BETWEEN them:

```tsx
<div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
  <button onClick={...add endpoint...}><IconPlus /></button>
  <button
    type="button"
    className="btn-icon"
    aria-label={t('addSubfolder')}
    title={t('addSubfolder')}
    onClick={(e) => { e.stopPropagation(); onAddSubfolder?.(node.path); }}
  >
    <IconFolderPlus />
  </button>
  <FolderRowMenu node={node} onExport={onExport} onRename={...} />
</div>
```

`IconFolderPlus` is already exported from `apps/web/src/ui/icons.tsx`.

- [ ] **Step 4: Test**

Add to `apps/web/tests/ui/EndpointList.folderAdd.test.tsx`:

```tsx
it('clicking + folder on a folder row pre-fills the new-folder input with the parent prefix', async () => {
  // Use the existing fixture (one endpoint in 'auth' folder).
  render(<EndpointList />);
  const folderHeader = screen.getByText('auth');
  const row = folderHeader.closest('.group') as HTMLElement;
  expect(row).not.toBeNull();
  const addFolderBtn = within(row).getByRole('button', { name: /add subfolder/i });
  await userEvent.click(addFolderBtn);

  // The NewFolderRow input now appears at the root with value="auth/".
  const input = screen.getByRole('textbox', { name: /new folder/i }) as HTMLInputElement;
  expect(input.value).toBe('auth/');
});
```

(Adjust the input role/name selector if the existing NewFolderRow uses different aria attributes — verify by reading its component code first. If aria-label isn't set, fall back to `screen.getByDisplayValue('auth/')`.)

- [ ] **Step 5: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/folder-row-add-subfolder
pnpm install   # if node_modules empty
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

All green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/EndpointList.tsx apps/web/src/i18n/locales apps/web/tests/ui/EndpointList.folderAdd.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): EndpointList folder rows gain "+ folder" button

Click pre-fills the existing NewFolderRow input with the parent
folder's path as a prefix (e.g. "auth/") so the user types just the
leaf segment to create a nested subfolder. Sits between the existing
"+ Add endpoint" button and the 3-dot menu on every folder row.

Pending folder rows intentionally omitted — keeps the
nesting-during-creation edge case out of scope. (Once the pending
folder commits to a real one, the button appears.)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: TypePanel — mirror

**Files:**
- Modify: `apps/web/src/ui/TypePanel.tsx`
- Modify: `apps/web/tests/ui/TypePanel.folderAdd.test.tsx`

Mirror Task 1's pattern:

- [ ] **Step 1: Panel handler**

```ts
function startSubfolder(parentPath: string): void {
  setCreatingBuffer(`${parentPath}/`);
}
```

Thread `onAddSubfolder` through the TypePanel's tree.

- [ ] **Step 2: Render the button** in `FolderRow` (or the equivalent name in TypePanel — verify by reading), placed between the existing `+ Add type` button and the FolderRowMenu.

- [ ] **Step 3: Test** — add 1 test mirroring Task 1's:

```tsx
it('clicking + folder on a type folder row pre-fills the input with the parent prefix', async () => {
  // ...
  await userEvent.click(addFolderBtn);
  expect(input.value).toBe('auth/');
});
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter web test
pnpm --filter web lint

git add apps/web/src/ui/TypePanel.tsx apps/web/tests/ui/TypePanel.folderAdd.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): TypePanel folder rows gain "+ folder" button

Same shape as the EndpointList commit. Click pre-fills the
NewFolderRow input with the parent folder's path as a prefix so
the user can quickly create a nested type subfolder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move spec/plan + final smoke

- [ ] **Step 1: Move + smoke**

```bash
git mv docs/specs/active/2026-04-28-folder-row-add-subfolder.md docs/specs/done/
git mv docs/plans/active/2026-04-28-folder-row-add-subfolder.md docs/plans/done/

pnpm --filter @zwaggen/core build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ship folder-row-add-subfolder — move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- `+ folder` button on EndpointList + TypePanel folder rows, between `+ Add` and ⋯ menu.
- Click sets `creatingBuffer` to `'{parent.path}/'`.
- 1 new i18n key per locale.
- 2 new tests pass.
- Existing tests still pass.
- Spec + plan moved to `done/`.
- Branch `plan/folder-row-add-subfolder` ready to push.
