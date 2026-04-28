# Spec — Folder row "+" button (add endpoint/type to folder)

## Problem

Users requested: *"add type/endpoint button on left of three-dot button"* on folder rows.

Today, to put a new endpoint or type inside a folder, you have to: (a) click the global "+" / "+ type" button at the panel header to create the item at root, (b) drag it into the folder. Two steps for what should be one. The 3-dot menu rows that landed in Slice 2A already provide the right anchor; we just need a peer "+" button on the left that creates the new item *already inside that folder*.

## Success criteria

- **EndpointList folder rows** show a "+" `<IconPlus>` button to the left of the 3-dot OverflowMenu. Visible on hover/focus-within (matches the menu's existing visibility pattern).
- Clicking it creates a new endpoint with `folder: node.path` (default GET / blank path / no params), then selects it. Same defaults as the existing panel-header `add()` function.
- **TypePanel folder rows** show the same "+" button. Clicking creates a new type at `joinKey(node.path, name)` where `name` auto-disambiguates as `NewType` / `NewType1` / `NewType2` (matching the existing `addType()` logic), then selects it.
- The "+" button uses `e.stopPropagation()` on its onClick handler so clicking doesn't toggle the folder's collapse state.
- New i18n keys `addEndpointToFolder` and `addTypeToFolder` (en + zh-TW).
- Tests:
  - Endpoint folder row "+" creates an endpoint with the correct `folder` and selects it.
  - Type folder row "+" creates a type with the correct folder prefix and selects it.
  - Clicking "+" doesn't toggle the folder's collapse (stopPropagation works).

## Out of scope

- A "+" button on root (non-folder) areas — the existing panel-header add buttons already handle that.
- Custom folder-aware default paths/names ("auth/" → method GET path /auth/...). v1 uses the same defaults as the existing global add. Easy follow-up.
- Bulk add (add 5 endpoints to folder). v1 is one click = one item.
- Confirm prompt before adding. The new item is empty and easy to delete.

## Approach

### EndpointList folder row

Inside `FolderRowMenu` or as a peer JSX element next to it. Cleanest: keep `FolderRowMenu` focused on the menu and add the "+" button as a sibling in the same `opacity-0 group-hover:opacity-100` wrapper.

```tsx
<div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
  <button
    type="button"
    className="btn-icon"
    aria-label={t('addEndpointToFolder')}
    title={t('addEndpointToFolder')}
    onClick={(e) => { e.stopPropagation(); onAddEndpoint?.(node.path); }}
  >
    <IconPlus />
  </button>
  <FolderRowMenu node={node} onExport={onExport} onRename={() => { ... }} />
</div>
```

Add `onAddEndpoint?: (folder: string) => void` to the row props. Thread up to `EndpointList` which handles the actual add:

```tsx
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

(Same shape as the existing `add()` function at line 248, plus `folder`.)

### TypePanel folder row

Mirror the pattern. The add helper:

```tsx
async function addTypeInFolder(folder: string) {
  // Auto-disambiguate name within the folder (mirrors addType's logic).
  let name = 'NewType';
  let i = 1;
  while (spec.types[joinKey(folder, name)]) name = `NewType${i++}`;
  const key = joinKey(folder, name);
  await setSpec({ ...spec, types: { ...spec.types, [key]: { kind: 'object', fields: [] } } });
  setSelected(key);
}
```

### i18n

`en.json`:
```json
"addEndpointToFolder": "Add endpoint to this folder",
"addTypeToFolder": "Add type to this folder"
```

`zh-TW.json`:
```json
"addEndpointToFolder": "在此資料夾新增端點",
"addTypeToFolder": "在此資料夾新增型別"
```

### Tests

`apps/web/tests/ui/EndpointList.folderAdd.test.tsx` — render the panel, find a folder row's add button, click it, assert a new endpoint exists with the right folder and is selected.

`apps/web/tests/ui/TypePanel.folderAdd.test.tsx` — same shape.

Additionally a stopPropagation assertion: render a folder, spy on the folder's collapse-toggle handler (or check that `endpointFolderCollapsed` state didn't change after clicking +). Or just trust the `e.stopPropagation()` and skip the assertion. v1: skip.

### Risks

- **Drag-and-drop interference** — the "+" button is positioned outside the row's draggable button (same as the OverflowMenu's button). Should not initiate drag. Verified pattern from Slice 2A.
- **Z-index / overflow** — the `<IconPlus>` button is small. No popover, no clipping risk. Sits in the same flex row as the menu button.

## Done definition

- "+" button on EndpointList + TypePanel folder rows.
- Click creates a new endpoint/type already in the folder, selects it.
- 2 new i18n keys per locale.
- 2 new tests pass; existing tests unchanged.
- Spec + plan moved to `done/`.
- Branch `plan/folder-row-add-button` pushed.
