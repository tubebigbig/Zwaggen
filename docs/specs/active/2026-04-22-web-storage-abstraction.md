# Spec — Storage abstraction in `apps/web`

## Problem

`apps/web` reaches directly into browser-only storage primitives in three places:

- **Spec autosave (drafts)** — `src/storage/drafts.ts` uses `idb-keyval` (IndexedDB) for `draft` (the in-progress Spec) and `secrets` (per-environment secret values).
- **File I/O for spec open/save** — `src/storage/file.ts` wraps the File System Access API (`showOpenFilePicker`, `showSaveFilePicker`, `FileSystemFileHandle.createWritable`).
- **Recently opened files** — there is no recents concept today; `state/store.ts` only remembers the most recent `fileHandle` in zustand state.

The future Electron desktop app needs different backends for at least the file I/O path (Electron's `dialog.showOpenDialog` + Node `fs/promises`) and the recents list (OS-native "Open Recent" menu fed by app-data on disk). Drafts/secrets *could* keep using IndexedDB inside the renderer, but giving consumers a single seam keeps the swap clean and means the desktop bundle isn't constrained to ship `idb-keyval`.

This is the second of three Electron prep jobs (after the core transport abstraction). It has minimal UI surface and zero behavioural change for browser users; it's a structural refactor that introduces a `SpecStorage` interface and routes existing call sites through it.

## Success criteria

- A new module `apps/web/src/storage/spec-storage.ts` exports:
  - `SpecStorage` interface covering: draft load/save/clear; file `pickOpen`, `pickSave`, `readFile`, `writeFile`; `listRecent`, `recordRecent`.
  - `RecentFile` type: `{ name: string; openedAt: number }`.
  - `FileRef` type alias for opaque file handles (`unknown` at the interface boundary; the browser default narrows it to `FileSystemFileHandle`).
  - `defaultStorage: SpecStorage` — browser implementation that delegates to the existing `storage/drafts.ts` (drafts only) and `storage/file.ts` (file I/O), and persists recents in a new IndexedDB key `zwaggen:recents`.
  - `setStorage(impl: SpecStorage): void` — module-level swap so tests and the future desktop shell can inject their own implementation. `getStorage()` returns the current impl.
- All consumers that today import draft or file functions directly switch to `getStorage()`:
  - `state/store.ts` — replace direct imports of `loadDraft/saveDraft/clearDraft` and the `readFile` lazy import; replace the `FileHandle` type alias with `FileRef`.
  - `ui/AppHeader.tsx` — replace direct imports of `pickOpen/pickSave/readFile/writeFile/FileHandle/supportsFileSystemAccess` with the storage interface (and the `supports` capability stays inside the browser default).
- **Recents are recorded automatically** whenever a spec is opened or saved successfully (the `pickOpen` and `pickSave` flows in `AppHeader.tsx`). Capped at 10 entries, deduplicated by name, newest first. **No UI exposure in v1** — the data is plumbed and persisted, but no menu/list is rendered. Desktop app and a future browser-side recents UI consume it later.
- Browser behaviour is unchanged: opening a file via the File System Access API still works; falling back to a classic file input (when `showOpenFilePicker` is unavailable) still works; saving via `writeFile` still works; the autosave loop still runs through IDB.
- **Out-of-scope items remain direct imports**: `loadSecrets/saveSecrets`, all of `storage/history.ts`, `downloadBlob`, `uploadFile`, `state/uiPrefs.ts` — these are not pulled into the v1 abstraction (see Out of scope).
- New test file `apps/web/tests/storage/spec-storage.test.ts` covers:
  - Default storage delegates draft load/save/clear to `idb-keyval` with the expected key.
  - Default storage records recents on open and dedupes by name with newest-first ordering.
  - Default storage caps recents at 10 entries.
  - `setStorage` swaps the active impl; `getStorage` returns the override.
  - `setStorage(undefined)` (or `resetStorage()`) restores the browser default — useful for test cleanup.
- All existing tests in `apps/web` pass unchanged.
- `pnpm --filter web lint && pnpm --filter web test` clean inside the worktree.
- TODO entry "Storage abstraction in `apps/web`" ticked.

## Out of scope

- **Secrets, history, download/upload helpers, UI prefs.** These keep using their existing direct imports in v1. Rationale: secrets and history can stay on IDB inside Electron's renderer with no behavioural difference; UI prefs already use plain `localStorage` and don't need a desktop swap; `downloadBlob`/`uploadFile` are browser-only fallbacks that the desktop app simply won't use. Each can be folded into the abstraction later if needed.
- **Recents UI.** v1 records recents but doesn't render them anywhere. Adding a "Recent Files" submenu / picker is its own work (will land alongside the desktop app or as a separate browser feature).
- **Reopening recents from the persisted handle.** `FileSystemFileHandle` instances *can* be persisted to IDB and re-resolved with a permission re-prompt. This is non-trivial UX (permission dialog, handle invalidation) and not needed by the desktop app (which uses paths instead). Skip for v1; the recents list stores names only. The `FileRef` slot in `RecentFile` is reserved (`handle?: FileRef`) but the browser default leaves it unset.
- **Desktop implementation.** Lands with the desktop app project. This prep ships only the interface + browser default + swap mechanism.
- **React context for storage injection.** Module-level singleton + `setStorage` is simpler and matches how other singletons in the codebase work (e.g. `useSpecStore` itself is a module-level zustand store). No need for ceremony.
- **Migration from old IDB keys.** Existing IDB keys (`zwaggen:draft`, `zwaggen:secrets`) keep their names — the default storage just reads/writes them as before. The new `zwaggen:recents` key starts empty for everyone (acceptable; recents have never existed).
- **Migrating `loadSecrets`/`saveSecrets` callers** in `RunPanel.tsx`, `AppHeader.tsx`, `batch.ts`. They keep their direct imports.

## Approach

### Files

**Create:**
- `apps/web/src/storage/spec-storage.ts` — the interface, browser default impl, singleton + swap helpers, and the new `RecentFile`/`FileRef` types.
- `apps/web/tests/storage/spec-storage.test.ts` — unit tests.

**Modify:**
- `apps/web/src/state/store.ts:3-5,9,13,15,29-69` — replace direct `loadDraft`/`saveDraft`/`clearDraft` imports and the `FileHandle` import with `getStorage()` calls; rename `FileHandle` → `FileRef` in the store's interface.
- `apps/web/src/ui/AppHeader.tsx:14-23,89-188` — replace direct `pickOpen`/`pickSave`/`readFile`/`writeFile`/`FileHandle`/`supportsFileSystemAccess` imports with `getStorage()` calls; the `uploadFile` and `downloadBlob` direct imports stay (they're fallbacks the desktop won't hit).

**Untouched:**
- `apps/web/src/storage/drafts.ts` — keeps its public functions; the new module just wraps them.
- `apps/web/src/storage/file.ts` — same. The browser default delegates here.
- `apps/web/src/storage/history.ts` — out of scope.
- `apps/web/src/runner/batch.ts`, `apps/web/src/ui/RunPanel.tsx`, `apps/web/src/ui/HistoryDrawer.tsx`, `apps/web/src/ui/ExportMenu.tsx` — they use secrets/history/download which stay direct.
- `apps/web/src/state/uiPrefs.ts` — out of scope.

### Interface shape

```ts
// apps/web/src/storage/spec-storage.ts
import type { Spec } from '@zwaggen/core';

export type FileRef = unknown;

export interface RecentFile {
  name: string;
  openedAt: number;
  /** Optional handle — browser default leaves this unset; desktop fills it with a path. */
  handle?: FileRef;
}

export interface OpenedFile {
  handle: FileRef;
  name: string;
  text: string;
}

export interface SpecStorage {
  // Spec autosave (browser: IDB key zwaggen:draft)
  loadDraft(): Promise<Spec | null>;
  saveDraft(spec: Spec): Promise<void>;
  clearDraft(): Promise<void>;

  // File I/O — browser uses File System Access API; falls back to `null` handle for classic upload
  supportsNativePicker(): boolean;
  pickOpen(): Promise<OpenedFile | null>;
  pickSave(suggestedName?: string): Promise<FileRef | null>;
  readFile(handle: FileRef): Promise<{ text: string; name: string }>;
  writeFile(handle: FileRef, text: string): Promise<void>;

  // Recent files (browser: IDB key zwaggen:recents, capped at 10)
  listRecent(): Promise<RecentFile[]>;
  recordRecent(entry: { name: string; handle?: FileRef }): Promise<void>;
}
```

### Browser default impl (sketch)

```ts
import { get, set } from 'idb-keyval';
import * as drafts from './drafts';
import * as fileIo from './file';

const RECENTS_KEY = 'zwaggen:recents';
const RECENTS_LIMIT = 10;

const browserDefault: SpecStorage = {
  loadDraft: drafts.loadDraft,
  saveDraft: drafts.saveDraft,
  clearDraft: drafts.clearDraft,

  supportsNativePicker: fileIo.supportsFileSystemAccess,

  async pickOpen() {
    const handle = await fileIo.pickOpen();
    if (!handle) return null;
    const { text, name } = await fileIo.readFile(handle);
    return { handle, text, name };
  },
  pickSave: fileIo.pickSave,
  readFile: (h: FileRef) => fileIo.readFile(h as FileSystemFileHandle),
  writeFile: (h: FileRef, text: string) => fileIo.writeFile(text, h as FileSystemFileHandle),

  async listRecent() {
    return (await get<RecentFile[]>(RECENTS_KEY)) ?? [];
  },
  async recordRecent({ name, handle }) {
    const current = (await get<RecentFile[]>(RECENTS_KEY)) ?? [];
    const filtered = current.filter((r) => r.name !== name);
    const next = [{ name, openedAt: Date.now(), handle }, ...filtered].slice(0, RECENTS_LIMIT);
    await set(RECENTS_KEY, next);
  },
};

let active: SpecStorage = browserDefault;
export function getStorage(): SpecStorage { return active; }
export function setStorage(impl: SpecStorage): void { active = impl; }
export function resetStorage(): void { active = browserDefault; }
```

### Why a module singleton, not React context

Other module-level singletons already live in `apps/web/src` (`useSpecStore` is a zustand singleton; `state/uiPrefs.ts` is a hand-rolled singleton). A `getStorage()` function call from anywhere — including non-React code like `state/store.ts` — is the simplest seam. React context would require provider plumbing in `App.tsx` and a hook for every consumer. Storage is process-wide, single-instance, and never needs to vary by React subtree.

### Why `FileRef = unknown`

The interface stays type-agnostic across implementations. The browser narrows internally to `FileSystemFileHandle`; the desktop will narrow to a string path or its own `Path` shape. Consumers (`state/store.ts`, `AppHeader.tsx`) only need to pass `FileRef` back to the same storage that produced it — they never inspect it. Casting at the impl boundary is honest and keeps the interface clean. (Alternative: a generic `SpecStorage<H>` would push handle types into every consumer; not worth the friction.)

### Recents recording strategy

`recordRecent` is called automatically inside the storage impl's `pickOpen` (after a successful read) — that's the natural moment to record a "recently opened" entry. The save flow (`pickSave` followed by `writeFile`) does NOT record recents in v1 (saving creates a NEW file, which the user can re-open later if they want; over-recording would clutter the list). This matches typical OS behaviour where "Recent" tracks opens, not saves.

Wait — that means re-saves of an already-open file don't update the entry's timestamp. Acceptable trade-off for v1: the entry was created on open, and re-opens bump the timestamp. If the user opens a file once and works on it for an hour, the entry stays. Good enough.

### `state/store.ts` changes

Replace these imports:

```ts
import { clearDraft, loadDraft, saveDraft } from '../storage/drafts';
import { FileHandle } from '../storage/file';
```

with:

```ts
import { getStorage, type FileRef } from '../storage/spec-storage';
```

Replace `FileHandle` with `FileRef` throughout the interface. Replace `loadDraft()` → `getStorage().loadDraft()`, etc. Replace the lazy `import('../storage/file')` for `readFile` with `getStorage().readFile(handle)`.

### `AppHeader.tsx` changes

Replace this import block (lines 14–23):

```ts
import {
  pickOpen,
  pickSave,
  readFile,
  supportsFileSystemAccess,
  uploadFile,
  writeFile,
  type FileHandle,
} from '../storage/file';
```

with:

```ts
import { downloadBlob, uploadFile } from '../storage/file';
import { getStorage, type FileRef } from '../storage/spec-storage';
```

Then in the open/save flows, replace direct calls:
- `supportsFileSystemAccess()` → `getStorage().supportsNativePicker()`
- `await pickOpen()` followed by `await readFile(h)` → `await getStorage().pickOpen()` (returns `OpenedFile` with handle/text/name in one shot)
- `await pickSave()` → `await getStorage().pickSave()`
- `await writeFile(text, h)` → `await getStorage().writeFile(h, text)` (note: storage interface puts handle first; helper signature is symmetric with `readFile`)
- `FileHandle | null` types → `FileRef | null`

`downloadBlob` and `uploadFile` (the classic-input fallback) keep their direct imports in `AppHeader.tsx` — see "Out of scope" reasoning.

### Test plan

`apps/web/tests/storage/spec-storage.test.ts`:

1. **Default delegates draft to idb-keyval.** Mock `idb-keyval`; call `getStorage().saveDraft({ ...spec })`; assert `set` called with key `'zwaggen:draft'`. Same for `loadDraft` (returns the parsed value) and `clearDraft` (calls `del`).

2. **`recordRecent` adds a new entry to the front.** Empty IDB. `recordRecent({ name: 'a.json' })`. Assert `listRecent()` returns `[{ name: 'a.json', openedAt: <number>, handle: undefined }]`.

3. **`recordRecent` dedupes by name (newest wins).** Pre-populate IDB with `[{ name: 'a.json', openedAt: 100, handle: undefined }, { name: 'b.json', openedAt: 50 }]`. `recordRecent({ name: 'b.json' })`. Assert `listRecent()` returns `[{ name: 'b.json', openedAt: <new>, ... }, { name: 'a.json', openedAt: 100, ... }]` — `b` moved to front, `a` preserved, no duplicates.

4. **`recordRecent` caps at 10.** Pre-populate IDB with 10 entries `name: 'f0.json'..'f9.json'`. `recordRecent({ name: 'new.json' })`. Assert `listRecent().length === 10` and the oldest (`f9`) is gone, `new` at front.

5. **`setStorage` swaps the active impl.** Custom impl that records calls. `setStorage(custom)`. `await getStorage().loadDraft()`. Assert custom impl was called. `resetStorage()`. Assert default is restored (call goes through to `idb-keyval` mock again).

`apps/web/tests/state/store.test.ts` (existing, if it exists) — verify it still passes after the refactor. If no test exists, the regression is caught by the broader suite running.

### Risks

- **AppHeader is the most-touched file.** It has multiple open/save flows (open, importOpenApi, compareSpec, saveSpec, importSpec). Each needs the same import change. Mechanical but high line count. Risk: missing one and leaving a stale direct call. Mitigation: grep for residual imports after the refactor (`grep -n "pickOpen\|pickSave\|writeFile\|readFile\|FileHandle" AppHeader.tsx`).
- **Lazy import in `state/store.ts:58`.** `discardDraft` does `await import('../storage/file')` for `readFile` to avoid a cycle with `AppHeader`. After the refactor it becomes `getStorage().readFile(handle)` — no dynamic import needed because `spec-storage.ts` doesn't import from `AppHeader`. Win.
- **Type drift on `FileRef`.** Renaming `FileHandle` to `FileRef` in store + AppHeader is a visible churn. Worth it for honesty (it's no longer guaranteed to be a `FileSystemFileHandle`).
- **Tests that mock `idb-keyval` directly.** Some existing tests may stub `idb-keyval`. The new code path goes through the same `idb-keyval` import, so existing mocks should still work. Verify by running the full web suite.
- **Recents recording inside `pickOpen`.** Calling `recordRecent` inside the impl's `pickOpen` means a future test of `pickOpen` always exercises the recents IDB. Fine — `idb-keyval` is mocked in tests anyway.

## Done definition

- New module `apps/web/src/storage/spec-storage.ts` ships the interface, types, default impl, and singleton helpers.
- `state/store.ts` and `ui/AppHeader.tsx` go through `getStorage()` for drafts and file I/O.
- `apps/web/tests/storage/spec-storage.test.ts` adds 5 tests; all pass.
- Existing `apps/web` tests pass unchanged.
- `pnpm --filter web lint && pnpm --filter web test` clean inside the worktree.
- Spec + plan moved to `done/`. TODO entry ticked.
- Branch `plan/web-storage-abstraction` pushed; user opens PR.
