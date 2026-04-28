# File extension standardization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the canonical Zwaggen spec filename to `spec.zwag.json` across Web download/bundle/pickSave defaults, while keeping the open/import filters inclusive of legacy `.json`, `.zwag`, `.zwag.json`, `.zwaggen.json` so existing user files keep loading.

**Architecture:** Touches `apps/web/src/storage/file.ts` (filters + pickSave default), `apps/web/src/ui/AppHeader.tsx` (download fallback + toast string), `apps/web/src/exporters/bundle.ts` (zip entry name), 2 i18n keys, and 1-2 docs filename mentions. Desktop IPC already uses `spec.zwag.json` — verify only.

**Tech Stack:** TypeScript, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-28-file-ext-standardize.md`.

---

### Task 1: Web file picker + filename defaults

**Files:**
- Modify: `apps/web/src/storage/file.ts` — pickOpen/pickSave accept filter union; pickSave default = `spec.zwag.json`; uploadFile accept string.
- Modify: `apps/web/src/ui/AppHeader.tsx` — download fallback filename + toast string.
- Modify: `apps/web/src/exporters/bundle.ts` — zip entry name.

- [ ] **Step 1: Patch `apps/web/src/storage/file.ts`**

```ts
// One source of truth for the accept filter — used by both pickers.
const ACCEPT_TYPES = [
  { description: 'Zwaggen Spec', accept: { 'application/json': ['.json', '.zwag', '.zwag.json', '.zwaggen.json'] } },
];

export async function pickOpen(): Promise<FileHandle | null> {
  try {
    const [handle] = await (globalThis as any).showOpenFilePicker({
      types: ACCEPT_TYPES,
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
      types: ACCEPT_TYPES,
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export function uploadFile(accept = '.json,.zwag,.zwag.json,.zwaggen.json,application/json'): Promise<...> { /* unchanged body */ }
```

- [ ] **Step 2: Patch `apps/web/src/ui/AppHeader.tsx`**

Replace the download fallback filename + toast (currently around line 205-206):

```ts
downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.zwag.json');
pushToast("Downloaded spec.zwag.json — your in-app draft is preserved. Use 'Open' to re-attach the file as your editing source.", 'info', 8000);
```

- [ ] **Step 3: Patch `apps/web/src/exporters/bundle.ts`**

Change the zip entry filename:

```ts
zip.file('spec.zwag.json', toJSON(spec));
```

- [ ] **Step 4: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/file-ext-standardize
pnpm install   # if node_modules empty
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

The existing test `apps/web/tests/ui/AppHeader.save.test.tsx` likely still passes — its assertion uses `expect(...).toMatch(/Downloaded.*draft is preserved/)` (regex match) which still matches the new string. Verify; fix any test that hard-codes `spec.zwaggen.json`.

If `bundle.ts` has tests that assert on the entry name (e.g., `expect(filenames).toContain('spec.zwaggen.json')`), update them to `spec.zwag.json`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/storage/file.ts apps/web/src/ui/AppHeader.tsx apps/web/src/exporters/bundle.ts apps/web/tests
git commit -m "$(cat <<'EOF'
refactor(web): standardize spec filename to spec.zwag.json

Web download fallback, bundle export, and pickSave default now use
spec.zwag.json. Open/import filters accept the union of .json /
.zwag / .zwag.json / .zwaggen.json so existing user files still
load.

Drops the historical .zwaggen.json default (matches the Desktop's
IPC default and the OS file association's .zwag prefix).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: i18n strings + Desktop verification + docs filename mentions

**Files:**
- Modify: `apps/web/src/i18n/locales/en.json` — `diffBadJson`.
- Modify: `apps/web/src/i18n/locales/zh-TW.json` — `diffBadJson`.
- Verify: `apps/desktop/electron/ipc.ts` — already `spec.zwag.json`.
- Modify: `apps/docs/guide/export-and-curl.md` (en) + `apps/docs/zh-TW/guide/export-and-curl.md` — filename mention.

- [ ] **Step 1: i18n updates**

`en.json`: change `diffBadJson` from `"Could not parse — expected a .zwaggen.json file."` to `"Could not parse — expected a .zwag.json file."`.

`zh-TW.json`: change from `"無法解析 — 需要 .zwaggen.json 檔案。"` to `"無法解析 — 需要 .zwag.json 檔案。"`.

If `grep -rn "zwaggen\.json" apps/web/src/i18n` reports more keys, update each.

- [ ] **Step 2: Verify Desktop IPC + electron-builder**

```bash
grep -n "spec\.zwag\|zwaggen" apps/desktop/electron/ipc.ts apps/desktop/electron-builder.yml
```

Expected:
- `ipc.ts` line ~176: `defaultPath: suggestedName ?? 'spec.zwag.json'` — already correct.
- `electron-builder.yml` line ~26: `ext: zwag` — file association unchanged (single extension).

If `dialog.showSaveDialog`'s filter list at line ~177 doesn't include `.zwag.json` or `.zwaggen.json` aliases, no fix needed (Electron's filter `extensions: ['zwag', 'json']` already matches both `.zwag` and `.json` and (by trailing match) `.zwag.json` / `.zwaggen.json`).

For `dialog.showOpenDialog` (search for it in `ipc.ts` — likely `handlePickOpen` or similar), confirm the filter is also permissive. Add legacy if missing.

- [ ] **Step 3: Docs filename sweep (1-2 places)**

Find:
```bash
grep -rn "zwaggen\.json" apps/docs
```

Update each occurrence to `.zwag.json` (en + zh-TW counterparts).

`apps/docs/guide/codegen.md` already uses `./api.zwag` (no `.json` suffix). Leave as-is — it's writing about the CLI flow where `zwag generate ts ./api.zwag` reads any extension. (If you'd rather standardize to `./api.zwag.json` for consistency, change it; flag as a deviation.)

This is filename-only. Anything broader (UX changes, missing feature mentions, etc.) is Slice 2.

- [ ] **Step 4: Verify**

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
```

(Desktop tests live separately under `apps/desktop`; if there's a workspace test command or if the Desktop ipc tests reference filenames, run them too.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n apps/desktop apps/docs
git commit -m "$(cat <<'EOF'
docs+i18n: align filename references to .zwag.json

i18n diffBadJson and the export-and-curl doc page now reference
.zwag.json. Desktop IPC + electron-builder verified — no change
needed (defaults already match).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move spec/plan + final smoke

- [ ] **Step 1: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-28-file-ext-standardize.md docs/specs/done/
git mv docs/plans/active/2026-04-28-file-ext-standardize.md docs/plans/done/
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
docs: ship file-ext-standardize — move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- Web download / bundle / pickSave default = `spec.zwag.json`.
- Picker accept filters = union of all 4 extensions.
- i18n strings reference `.zwag.json`.
- Toast / alert text uses the new filename.
- Desktop IPC already correct (verified, no change).
- Docs filename mentions updated (full feature sweep deferred to Slice 2).
- All tests + lint + build green.
- Spec + plan moved to `done/`.
- Branch `plan/file-ext-standardize` ready to push.
