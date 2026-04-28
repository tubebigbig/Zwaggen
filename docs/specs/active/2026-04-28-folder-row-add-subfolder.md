# Spec — Folder row "+ folder" (add subfolder)

## Problem

The panel-header "+ folder" button creates pending folders only at root. To create a subfolder like `auth/oauth`, users have to type the full path including slashes — easy to forget. After the recent "+ Add endpoint/type" button shipped on folder rows, the natural next addition is a "+ folder" sibling that creates a nested pending subfolder.

## Success criteria

- Each folder row in EndpointList AND TypePanel shows a `+ folder` button (using `IconFolderPlus`) BETWEEN the existing `+ Add endpoint/type` button and the ⋯ 3-dot menu. Visible on hover/focus-within (same opacity wrapper).
- Click → sets the panel's `creatingBuffer` to `'{folder.path}/'`. The existing `NewFolderRow` (rendered at the panel-root location) appears with the parent prefix already filled in. User types the leaf segment and Enter commits.
- The panel-header `+ folder` button keeps its current behavior (sets buffer to `''`).
- Pending folder rows do NOT get the button (folder isn't real yet — keeps the nesting-during-pending edge case out of scope).
- New i18n key `addSubfolder` (en: "Add subfolder", zh-TW: "新增子資料夾").
- Tests:
  - Click the per-row `+ folder` button on `auth` → `creatingBuffer` becomes `'auth/'`
  - Commit `auth/oauth` (typing `oauth` after the prefix) → appears in `pendingFolders`
  - Existing tests for the panel-header `+ folder` still pass (root creation unchanged)

## Out of scope

- Rendering the NewFolderRow input INSIDE the parent folder's children area (visually nested). v1 keeps the input at the panel-root location with the prefix in the field.
- Adding the `+ folder` button to PENDING folder rows. Folder isn't committed yet — adds a nesting-during-creation edge case. Defer.
- Persisting the prefix when the user clears the buffer mid-edit. If the user backspaces over the prefix and types something different (`other/path`), the result is whatever they typed. Same as the existing root flow.
- A breadcrumb or visual hint pointing to which parent the new subfolder will live under (the prefix in the input field IS the hint).

## Approach

### EndpointList + TypePanel — `FolderTreeChild` / `FolderRow`

Add a new prop `onAddSubfolder?: (parentPath: string) => void` to the row component, threaded down from the panel.

Inside the existing flex wrapper that holds the `+ Add endpoint/type` button and the FolderRowMenu, insert a new `+ folder` button BETWEEN them:

```tsx
<div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
  <button onClick={...add endpoint/type...}><IconPlus /></button>
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

### Panel-level handler

In `EndpointList`:

```ts
function startSubfolder(parentPath: string): void {
  setCreatingBuffer(`${parentPath}/`);
}
```

Pass `onAddSubfolder={startSubfolder}` down through the tree. Same wiring in `TypePanel`.

### NewFolderRow

No changes — it already handles arbitrary buffer strings. The user types into the existing input that now has `auth/` pre-populated.

The input's `onCommit` handler (`commitNewFolder`) already calls `normalizeFolder(buffer)` which canonicalizes paths with `/`. So `auth/oauth` lands as the normalized form.

### i18n

`en.json`:
```json
"addSubfolder": "Add subfolder"
```

`zh-TW.json`:
```json
"addSubfolder": "新增子資料夾"
```

### Tests

`apps/web/tests/ui/EndpointList.folderAdd.test.tsx` — extend with one test:

```tsx
it('clicking + folder on a folder row pre-fills the new-folder input with the parent prefix', async () => {
  // setup: spec with 1 folder 'auth'
  // render <EndpointList />
  // hover/focus on the auth folder row → click + folder button (aria-label "Add subfolder")
  // assert: a NewFolderRow input appears at the root with value="auth/"
});
```

`apps/web/tests/ui/TypePanel.folderAdd.test.tsx` — same.

### Risks

- **Order in the cluster** — `+ Add` (item) → `+ folder` (subfolder) → ⋯ (menu). Reads left-to-right as "add small thing → add bigger container → other actions". Sound to me; flag if you'd order differently.
- **The existing creatingBuffer state is just a string** — single buffer, single new-folder slot. Clicking `+ folder` while another buffer is active OVERWRITES the in-flight one. Acceptable: only one new folder at a time.
- **DnD collision check** — `commitNewFolder` already normalizes and rejects collisions with existing real folders or duplicate pending entries. Subfolder paths flow through the same path; no extra validation needed.

## Done definition

- `+ folder` button on EndpointList + TypePanel folder rows.
- Click pre-fills `creatingBuffer` with `'{parent}/'`.
- 1 new i18n key per locale.
- 2 new tests pass; existing tests unchanged.
- Spec + plan moved to `done/`.
- Branch `plan/folder-row-add-subfolder` pushed.
