# Spec — File extension standardization

## Problem

Spec files appear under three different extensions across the codebase:

- **Web (browser)** — `.zwaggen.json` everywhere: download default (`AppHeader.tsx:205`), bundle export (`bundle.ts:16`), pickSave default (`storage/file.ts:20`), accept filters (`storage/file.ts:10,24,55`), i18n strings (`diffBadJson`).
- **Desktop (Electron)** — `.zwag` for the OS file association (`electron-builder.yml:26`), but `.zwag.json` as the IPC save-dialog default (`ipc.ts:176`).
- **Docs** — mixed: `apps/docs/guide/codegen.md` uses `./api.zwag`; `apps/docs/guide/export-and-curl.md` uses `.zwaggen.json`.

Result: users see different filenames in different parts of the product. Docs disagree with the app. Existing files saved under any of the three names should keep loading.

## Success criteria

- New canonical extension for downloads, bundle exports, and save-dialog defaults: **`.zwag.json`**. Reasoning: short brand prefix matches the CLI binary name (`zwag`) and the Desktop file association (`.zwag`); trailing `.json` lets editors apply JSON syntax highlighting.
- Open/import filters in BOTH Web and Desktop accept the union: `.json`, `.zwag`, `.zwag.json`, `.zwaggen.json`. Legacy files keep loading.
- Save-dialog defaults across Web (`pickSave` in `storage/file.ts`) and Desktop IPC use `spec.zwag.json`.
- Web download (`AppHeader.tsx`) and bundle export (`bundle.ts`) emit `spec.zwag.json`.
- Toast / alert messages that mention the filename use `.zwag.json`.
- i18n updates: `diffBadJson` ("Could not parse — expected a .zwaggen.json file.") tightens to `.zwag.json` (or stays accepting both via reword like "expected a .zwag.json file").
- Desktop's OS file association (`electron-builder.yml`) stays `.zwag` only — Windows + macOS handle double-extensions inconsistently; double-click of `spec.zwag.json` opens whatever the OS associates with `.json` (usually the user's editor — fine). Users who want one-click open into Zwaggen Desktop rename to `spec.zwag`.
- Tests updated to reflect the new defaults; tests that exercise loading still cover all 4 legacy extensions.

## Out of scope

- Adding a `.zwag.json` association in `electron-builder.yml`. Cross-platform double-extension association is messy; defer until users ask.
- Migrating users' existing saved files (we never wrote a `.zwag.json` migrator and don't need one — the Open dialog accepts the legacy names).
- Renaming the `zwag` CLI binary.
- A schema-detection step (e.g., "if filename ends in `.zwaggen.json` show a 'rename suggestion' toast"). Out of scope; legacy names are accepted silently.
- Updating apps/docs content (that's Slice 2 — `docs-feature-sweep`).

## Approach

### Web — `apps/web/src/storage/file.ts`

```ts
const ACCEPT = { 'application/json': ['.json', '.zwag', '.zwag.json', '.zwaggen.json'] };

export async function pickOpen(): Promise<FileHandle | null> {
  try {
    const [handle] = await (globalThis as any).showOpenFilePicker({
      types: [{ description: 'Zwaggen Spec', accept: ACCEPT }],
      multiple: false,
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function pickSave(suggestedName = 'spec.zwag.json'): Promise<FileHandle | null> {
  try {
    const handle = await (globalThis as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Zwaggen Spec', accept: ACCEPT }],
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

// uploadFile (the no-FSA fallback):
export function uploadFile(accept = '.json,.zwag,.zwag.json,.zwaggen.json,application/json'): Promise<...> { ... }
```

### Web — `apps/web/src/ui/AppHeader.tsx`

Change the download fallback filename + the toast hint:

```ts
downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.zwag.json');
pushToast("Downloaded spec.zwag.json — your in-app draft is preserved. Use 'Open' to re-attach the file as your editing source.", 'info', 8000);
```

### Web — `apps/web/src/exporters/bundle.ts`

```ts
zip.file('spec.zwag.json', toJSON(spec));
```

### Web — i18n

`diffBadJson`:
- en: `"Could not parse — expected a .zwag.json file."`
- zh-TW: `"無法解析 — 需要 .zwag.json 檔案。"`

Search for any other hard-coded filename strings: `grep -i "zwaggen\.json\|zwag\.json" apps/web/src/i18n` and update each.

### Desktop — `apps/desktop/electron/ipc.ts`

Already uses `spec.zwag.json` as the default. Verify the filter list is `['zwag', 'json']` and ADD legacy:

Actually `electron`'s `dialog.showSaveDialog` filters use file-extension strings without dots — `['zwag', 'json']` matches both `*.zwag` and `*.json`. But `*.zwag.json` matches `json`'s trailing extension, so it'd also match. Verify this works as expected; Electron's filter is permissive on multi-segment names.

For `dialog.showOpenDialog` (probably also in `ipc.ts` — verify): the filter should be inclusive too.

### Desktop — `electron-builder.yml`

NO CHANGE. Keep the `.zwag` file association. Document in the spec that double-extension OS association is deferred.

### Tests

Most existing tests use one of the four extensions in fixtures. They should continue to pass since pickers accept all four. The only required test changes:
- `apps/web/tests/ui/AppHeader.save.test.tsx` — assertion text mentions `Downloaded spec.zwag.json`.
- Any test that asserts on the old `spec.zwaggen.json` text in toast messages.

Add a new test:
- `apps/web/tests/storage/file.acceptFilter.test.ts` — verify `pickOpen`/`pickSave` accept-filter includes all 4 extensions. (May be tricky to assert on the showOpenFilePicker call args; can spy on the global stub and inspect the `types` argument.)

### Docs (one-line filename updates only)

This slice intentionally limits doc edits to the bare-minimum `.zwaggen.json` → `.zwag.json` swap in 1-2 places, NOT a full feature sweep:

- `apps/docs/guide/export-and-curl.md` — change `.zwaggen.json` mention to `.zwag.json`.
- `apps/docs/guide/codegen.md` — already uses `.zwag` (singular); leave as-is or align to `.zwag.json` for consistency. Implementer's call.
- (zh-TW counterparts of the above)

Anything broader (RunPanel mentions, missing export popover docs, etc.) is Slice 2.

### Risks

- **Double-extension on Windows**: `spec.zwag.json` saves as `spec.zwag.json` on Windows file-explorer (no extension hiding for the inner `.zwag`). Acceptable — users should see the full name.
- **`spec.zwag.json` might collide with VS Code's user `.zwag.json` schema** (none today). No concern.
- **Recents UI**: Desktop's recents list shows the basename. Both `spec.zwag` and `spec.zwag.json` render reasonably. No change needed.
- **Browser download dialog**: Some browsers (Safari) auto-append `.json` when the MIME is `application/json`. Result might be `spec.zwag.json.json` if not careful. Verify with real download tests; if so, drop the inner `.zwag` from the suggested name (use `spec.zwag` and let the browser append `.json`). If it's a real issue, this slice can punt the Web fallback to just `spec.zwag` — implementer's judgment after testing.

## Done definition

- Web download/bundle/pickSave default = `spec.zwag.json`.
- Open/import filters accept all 4 extensions in both Web and Desktop.
- i18n strings reference `.zwag.json`.
- 1-2 doc filename mentions updated (full sweep deferred to Slice 2).
- All existing tests pass; toast/alert assertions reflect new filename.
- Spec + plan moved to `done/`.
- Branch `plan/file-ext-standardize` pushed.
