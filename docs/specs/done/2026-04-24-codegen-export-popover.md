# Spec — Codegen export popover + 3-dot menu refactor (Slice 2A)

## Problem

The web app has no way to export a single endpoint, a single type, or one folder's worth of types and endpoints. Users who want to share "the auth subsystem of our API" with a teammate currently have two options: (a) export the whole spec via the existing top-bar Export menu and ask the recipient to ignore the parts they don't care about, or (b) re-type the endpoint as a cURL by hand.

Slice 1 already moved the codegen into `@zwaggen/core` and added `resolveSlice(spec, { endpointIds?, typeKeys?, folderPrefix? })`. This slice surfaces that capability through a small "Export" affordance on every endpoint, type, and folder — and consolidates the existing per-row delete actions into a single 3-dot dropdown menu so the new Export entry has a natural home.

## Success criteria

- A 3-dot (OverflowMenu) dropdown on five UI surfaces:
  - **EndpointEditor header** — replaces the standalone trash-icon delete button. Items: Export, Duplicate (disabled placeholder for future), Delete.
  - **EndpointList endpoint rows** — opacity-0 group-hover (matches the existing folder-rename-pencil pattern). Items: Export, Duplicate (disabled), Delete.
  - **EndpointList folder rows** — sits next to the existing rename-pencil. Items: Export folder, Rename, Delete folder.
  - **TypePanel type rows** — opacity-0 group-hover. Items: Export, Duplicate (disabled), Delete.
  - **TypePanel folder rows** — Items: Export folder, Rename, Delete folder.
- A new `<ExportPopover>` modal that opens when any "Export" / "Export folder" item is clicked. Uses the existing `LoadErrorModal` shell shape (fixed overlay, Escape to close, role="dialog").
- Format tabs in the popover vary by scope:
  - **Endpoint scope**: cURL / TS client method / OpenAPI snippet (3 tabs).
  - **Type scope**: TS interface / Zod schema / JSON Schema fragment (3 tabs).
  - **Folder scope**: types.ts / schemas.ts / client.ts / openapi.json (4 tabs).
- Each tab renders a read-only monospace `<pre>` with the generated output + a "Copy" button (clipboard.writeText with the same fallback shape RunPanel uses for cURL) + a "Download" button (single-file download via Blob + anchor click).
- All codegen output uses the Slice 1 entry points: `generateTs/Zod/Client(spec, { only })` and `toOpenApi(spec, { only })`. cURL uses the existing `buildRequest` + `toCurl` runner code with empty placeholder inputs.
- JSON Schema fragment for the type-export tab: derived from `toOpenApi(spec, { only: { typeKeys: [key] } })`'s `components.schemas[flattenedKey]`, pretty-printed.
- All five new menu surfaces share a single `<OverflowMenu>` instance; menu items are `<button role="menuitem">` so existing Escape/click-outside handling carries over.
- "Duplicate" item is rendered with `disabled` + a tooltip-or-helper text saying "Coming soon"; clicking is a no-op. Implementation lands in a future slice.
- i18n strings in en + zh-TW for every new label (Export, Export folder, Duplicate, Coming soon, format-tab names, Copy, Download, Copied!).
- Tests cover:
  - Each surface renders an OverflowMenu in the right place.
  - Clicking "Delete" still triggers the existing delete handler (no behavior regression on the existing surface).
  - Clicking "Export" opens the popover with the right scope and the right tab set.
  - Each tab's output for a fixture spec contains the expected name and excludes unrelated names (smoke that `{ only }` is wired correctly).
  - Folder export shows 4 tabs and each produces non-empty output.
- TODO ticked: the four Export entries (per-endpoint, per-type, folder, codegen-preview-readiness — except the live preview is Slice 2B). The first three Export entries flip to `[x]`; live preview stays unchecked, with a note pointing at the Slice 2B plan once written.

## Out of scope

- **Live codegen preview panel** — moves to Slice 2B (separate plan).
- **Duplicate** — placeholder only; no implementation.
- **ZIP bundle** for folder export — v1 is "4 separate Download buttons in 4 tabs". Adding JSZip can come later if users ask.
- **Editable export preview** — the popover is read-only. Editing happens in the spec; the export reflects whatever the spec says.
- **Format-on-display** — output is the raw codegen string. The CLI's prettier/eslint formatting step is Node-only and we don't pull a browser formatter for v1. The codegen output is already deterministic and readable; a "Format with Prettier" toggle can be added later.
- **Export from the existing top-bar `<ExportMenu>` (full-spec export)** — that menu already handles full-spec OpenAPI export. We're not touching it.
- **Per-row Duplicate behavior** — `Duplicate` is a disabled placeholder. The actual implementation will need to copy the type/endpoint with a new ID + name suffix (e.g., `User Copy`); deferred.
- **`unresolvedEndpointIds` resolver field** raised in Slice 1's code review — not needed here because the export menus only pass IDs derived from the spec's own list (no typo risk). Document the contract in the popover's component-level comment.

## Approach

### `<OverflowMenu>` reuse

Already exists at `apps/web/src/ui/OverflowMenu.tsx` (used + tested via `apps/web/tests/ui/OverflowMenu.test.tsx`). Renders a 3-dot button + a positioned popover; click-outside + Escape dismiss. Children are caller-supplied JSX. We pass `<button role="menuitem">` items.

To reduce per-call duplication, define one small render helper inside each surface (or a shared `<MenuItem>` component) so the styling is consistent:

```tsx
function MenuItem({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
```

Place at `apps/web/src/ui/MenuItem.tsx` so all five surfaces import it.

### Per-surface wiring

Each surface gets a thin wrapper:

```tsx
<OverflowMenu>
  <MenuItem onClick={() => setExportTarget({ kind: 'endpoint', id: ep.id })}>{t('export')}</MenuItem>
  <MenuItem disabled>{t('duplicate')} <span className="text-xs text-slate-400">({t('comingSoon')})</span></MenuItem>
  <MenuItem onClick={() => onDelete(ep.id)} className="text-red-700">{t('delete')}</MenuItem>
</OverflowMenu>
```

`setExportTarget` is a piece of local state in `App.tsx` (or whatever component renders the EndpointList / TypePanel) that controls which `<ExportPopover>` is open. Passing it down via prop drilling is fine; it's two levels deep at most.

For the EndpointEditor header: the existing trash button is removed and replaced with `<OverflowMenu>` in the same right-aligned position.

### `<ExportPopover scope={...}>`

```tsx
type ExportScope =
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'type'; typeKey: string }
  | { kind: 'folder'; prefix: string };

interface Props {
  scope: ExportScope;
  onClose: () => void;
}
```

Inside:
1. Compute the codegen output(s) on first render via `useMemo(spec, scope)`. Recomputing on spec change is OK — the modal stays mounted only briefly.
2. Render the modal shell (mirror `LoadErrorModal`).
3. Render the format tabs as a horizontal row of `<button role="tab">` controlling local `selectedTab` state.
4. Render the active tab's `<pre>` with output, and Copy / Download buttons.

Per-scope outputs:

| Scope | Tab | Source |
|-------|-----|--------|
| endpoint | cURL | `buildRequest(spec, ep, baseUrl, syntheticEmptyInputs, secrets, false).then(toCurl)` |
| endpoint | TS client method | `generateClient(spec, { only: { endpointIds: [id] } })` |
| endpoint | OpenAPI snippet | `JSON.stringify(toOpenApi(spec, { only: { endpointIds: [id] } }), null, 2)` |
| type | TS interface | `generateTs(spec, { only: { typeKeys: [key] } })` |
| type | Zod schema | `generateZod(spec, { only: { typeKeys: [key] } })` |
| type | JSON Schema fragment | `JSON.stringify(toOpenApi(spec, { only: { typeKeys: [key] } }).components.schemas[flattenedKey], null, 2)` |
| folder | types.ts | `generateTs(spec, { only: { folderPrefix } })` |
| folder | schemas.ts | `generateZod(spec, { only: { folderPrefix } })` |
| folder | client.ts | `generateClient(spec, { only: { folderPrefix } })` |
| folder | openapi.json | `JSON.stringify(toOpenApi(spec, { only: { folderPrefix } }), null, 2)` |

`flattenedKey` is `key.replace(/\//g, '_')` — `toOpenApi` flattens slashes to make valid OpenAPI component names.

### `syntheticEmptyInputs` for cURL

The runner expects `{ path, query, headers, body }` value maps. For an out-of-context endpoint export, the user hasn't typed anything — generate a synthetic input map that uses `{{paramName}}` placeholders so the resulting cURL has explicit "fill these in" markers:

```ts
function placeholderInputs(ep: Endpoint, spec: Spec): RunInputs {
  const path: Record<string, string> = {};
  for (const p of ep.pathParams) path[p.name] = `{{${p.name}}}`;

  const query: Record<string, string> = {};
  const queryFields = resolveParamFields(ep.queryParams, spec);
  for (const f of queryFields) query[f.name] = `{{${f.name}}}`;

  const headers: Record<string, string> = {};
  const headerFields = resolveParamFields(ep.headers, spec);
  for (const f of headerFields) headers[f.name] = `{{${f.name}}}`;

  let body: unknown = undefined;
  if (ep.requestBody) body = exampleFromType(ep.requestBody, spec);
  // (urlencoded/multipart bodies use bodyForm — same placeholder treatment)

  return { path, query, headers, body };
}
```

`exampleFromType` already exists in `@zwaggen/core` (used by the example generator). If it doesn't suit, use `JSON.stringify(resolveExample(...))` or a literal `{ /* fill in */ }` placeholder. Implementer chooses.

### Modal shell

Reuse the LoadErrorModal pattern: fixed overlay (`role="dialog" aria-modal="true"`), white card flex-col, X close button + Escape handler. Don't extract a generic `<Modal>` component yet — Slice 2B will need one too, and the natural moment to factor is when there are 2+ usages.

### Tab UI

Inline horizontal `<button role="tab">` row with `aria-selected`. No third-party tab lib.

### Copy / Download

```tsx
async function copy() {
  try {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  } catch {
    // Fallback: select-all the textarea so the user can ctrl-C manually.
    fallbackTextareaRef.current?.select();
  }
}

function download() {
  const blob = new Blob([output], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameForTab(scope, activeTab);  // e.g. 'getUser.curl.sh' / 'User.ts' / 'auth/types.ts'
  a.click();
  URL.revokeObjectURL(url);
}
```

### File naming for downloads

| Scope + Tab | Filename |
|-------------|----------|
| endpoint cURL | `{endpoint.id}.curl.sh` |
| endpoint TS | `{endpoint.id}.ts` |
| endpoint OpenAPI | `{endpoint.id}.openapi.json` |
| type TS | `{flattenedKey}.ts` |
| type Zod | `{flattenedKey}.schema.ts` |
| type JSON Schema | `{flattenedKey}.schema.json` |
| folder types.ts | `{folderName}.types.ts` |
| folder schemas.ts | `{folderName}.schemas.ts` |
| folder client.ts | `{folderName}.client.ts` |
| folder openapi.json | `{folderName}.openapi.json` |

`folderName` = the leaf segment of the prefix (e.g. `auth/oauth` → `oauth`). Document the rule in a small util.

### i18n strings (en)

```json
"export": "Export",          // already exists for the top-bar button — reuse
"exportFolder": "Export folder",
"duplicate": "Duplicate",
"comingSoon": "coming soon",
"livePreview": "Live preview",  // reserved for Slice 2B; OK to add now
"copyOutput": "Copy",
"downloadOutput": "Download",
"copied": "Copied!",         // already exists — reuse
"exportTabCurl": "cURL",
"exportTabTsClient": "TS client",
"exportTabOpenApiSnippet": "OpenAPI",
"exportTabTsInterface": "TS interface",
"exportTabZod": "Zod schema",
"exportTabJsonSchema": "JSON Schema",
"exportTabTypes": "types.ts",
"exportTabSchemas": "schemas.ts",
"exportTabClient": "client.ts",
"exportTabOpenApi": "openapi.json"
```

zh-TW counterparts in the same file.

### Tests

`apps/web/tests/ui/`:
- `EndpointList.overflowMenu.test.tsx` — endpoint row's menu opens, Delete still wired to the prop, Export sets the scope.
- `EndpointList.folderOverflowMenu.test.tsx` — folder row's menu has Export folder + Rename + Delete folder.
- `TypePanel.overflowMenu.test.tsx` — type row's menu opens, Delete still wired, Export sets scope.
- `EndpointEditor.overflowMenu.test.tsx` — header's menu replaces the trash button; clicking Delete still calls the parent's delete handler.
- `ExportPopover.endpoint.test.tsx` — opens with `kind:'endpoint'`, 3 tabs visible, cURL output contains the path + `{{name}}` placeholders, TS tab contains the endpoint id + a referenced type's name.
- `ExportPopover.type.test.tsx` — 3 tabs, Zod tab contains `XSchema`, JSON Schema tab contains `properties`.
- `ExportPopover.folder.test.tsx` — 4 tabs, each non-empty.
- Existing tests (RunPanel, EndpointEditor, TypePanel, EndpointList) must keep passing — the new menu adds an action area but doesn't move the underlying row content.

### Risks

- **`@dnd-kit` row drag handles vs OverflowMenu click target** — rows in EndpointList and TypePanel are draggable. The OverflowMenu button must `stopPropagation` on click so the drag doesn't start. Verify with a manual interaction test.
- **TypePanel rows are inside a slide-out panel with `z-30`** — the menu's positioned popover must use a higher z-index OR be rendered as a portal. The existing `OverflowMenu` uses `z-30 absolute`, same tier. Confirm the popover doesn't get clipped or hidden.
- **Existing keyboard-DnD e2e** (`apps/web/e2e/keyboard-dnd.spec.ts`) — the Space key currently grabs a row for keyboard drag. The OverflowMenu button captures focus too; ensure Space on the menu button toggles the menu (not a drag grab).
- **EndpointEditor delete confirm** — today's standalone delete button might or might not have a confirm step. Preserve whatever confirm flow exists when wrapping it in the menu (don't accidentally drop a `confirm()`).

## Done definition

- 5 surfaces show the new 3-dot menu with consistent items.
- `<ExportPopover>` opens for endpoint / type / folder scopes with the correct tab set and correct outputs.
- Copy + Download work in all tabs.
- All existing tests pass; new tests cover each surface and the popover output.
- i18n strings added in both locales.
- TODO entries ticked (per-endpoint export, per-type export, folder export). Live preview entry stays open; Slice 2B will tick it.
- Spec + plan moved to `done/`.
- Branch `plan/codegen-export-popover` pushed.
