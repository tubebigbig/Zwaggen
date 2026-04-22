# Storage abstraction in `apps/web` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `SpecStorage` interface and route the existing draft autosave + file I/O call sites through it, so the future Electron desktop app can swap in a Node-backed implementation without touching consumers. Also record opened files in a new IDB-backed recents list (no UI exposure in v1).

**Architecture:** New module `apps/web/src/storage/spec-storage.ts` exports an interface, a browser default that delegates to existing `storage/drafts.ts` + `storage/file.ts` (and adds recents persistence via `idb-keyval` under `zwaggen:recents`), and a `getStorage()` / `setStorage()` singleton. `state/store.ts` and `ui/AppHeader.tsx` switch from direct module imports to `getStorage()`. Secrets, history, and download/upload helpers stay direct (out of scope per spec).

**Tech Stack:** TypeScript, vitest, idb-keyval, no new deps.

---

### Spec

See `docs/specs/active/2026-04-22-web-storage-abstraction.md` for full context. Acceptance highlights:

- New `SpecStorage` interface with: drafts (`load/save/clear`), file I/O (`supportsNativePicker`, `pickOpen`, `pickSave`, `readFile`, `writeFile`), recents (`listRecent`, `recordRecent`).
- Browser default impl wraps existing modules; recents stored in `zwaggen:recents` IDB key, capped at 10, dedupe by name.
- `getStorage()` / `setStorage(impl)` / `resetStorage()` singleton + swap.
- `state/store.ts` uses `getStorage()` for drafts and `readFile`; replaces `FileHandle` type with `FileRef`.
- `ui/AppHeader.tsx` uses `getStorage()` for drafts/file I/O; keeps direct `downloadBlob`/`uploadFile` imports (browser-only fallbacks).
- `pickOpen` automatically calls `recordRecent` after a successful read.
- 5 new tests; all existing tests pass.

---

### Task 1: Write failing tests for the browser-default storage

**Files:**
- Create: `apps/web/tests/storage/spec-storage.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// apps/web/tests/storage/spec-storage.test.ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    __reset: () => store.clear(),
  };
});

import * as idb from 'idb-keyval';
import { getStorage, setStorage, resetStorage, type SpecStorage } from '../../src/storage/spec-storage';
import { emptySpec } from '@zwaggen/core';

beforeEach(() => {
  resetStorage();
  (idb as any).__reset();
  vi.clearAllMocks();
});
afterEach(() => { resetStorage(); });

test('default storage delegates draft load/save/clear to idb-keyval', async () => {
  const spec = emptySpec();
  await getStorage().saveDraft(spec);
  expect(idb.set).toHaveBeenCalledWith('zwaggen:draft', spec);

  const loaded = await getStorage().loadDraft();
  expect(loaded).toEqual(spec);

  await getStorage().clearDraft();
  expect(idb.del).toHaveBeenCalledWith('zwaggen:draft');
  expect(await getStorage().loadDraft()).toBeNull();
});

test('recordRecent adds a new entry to the front', async () => {
  await getStorage().recordRecent({ name: 'a.json' });
  const list = await getStorage().listRecent();
  expect(list).toHaveLength(1);
  expect(list[0]!.name).toBe('a.json');
  expect(typeof list[0]!.openedAt).toBe('number');
});

test('recordRecent dedupes by name with newest at front', async () => {
  await getStorage().recordRecent({ name: 'a.json' });
  await new Promise((r) => setTimeout(r, 1));
  await getStorage().recordRecent({ name: 'b.json' });
  await new Promise((r) => setTimeout(r, 1));
  await getStorage().recordRecent({ name: 'a.json' });

  const list = await getStorage().listRecent();
  expect(list.map((r) => r.name)).toEqual(['a.json', 'b.json']);
  expect(list[0]!.openedAt).toBeGreaterThanOrEqual(list[1]!.openedAt);
});

test('recordRecent caps the list at 10', async () => {
  for (let i = 0; i < 12; i++) {
    await getStorage().recordRecent({ name: `f${i}.json` });
  }
  const list = await getStorage().listRecent();
  expect(list).toHaveLength(10);
  expect(list[0]!.name).toBe('f11.json');
  expect(list[9]!.name).toBe('f2.json');
});

test('setStorage swaps the active impl; resetStorage restores the default', async () => {
  const calls: string[] = [];
  const fake: SpecStorage = {
    loadDraft: async () => { calls.push('loadDraft'); return null; },
    saveDraft: async () => { calls.push('saveDraft'); },
    clearDraft: async () => { calls.push('clearDraft'); },
    supportsNativePicker: () => false,
    pickOpen: async () => { calls.push('pickOpen'); return null; },
    pickSave: async () => { calls.push('pickSave'); return null; },
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => { calls.push('writeFile'); },
    listRecent: async () => [],
    recordRecent: async () => { calls.push('recordRecent'); },
  };

  setStorage(fake);
  await getStorage().loadDraft();
  expect(calls).toEqual(['loadDraft']);

  resetStorage();
  await getStorage().loadDraft();
  expect(idb.get).toHaveBeenCalledWith('zwaggen:draft');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- spec-storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit (red state)**

```bash
git add apps/web/tests/storage/spec-storage.test.ts
git commit -m "test(web): add failing tests for SpecStorage interface and browser default"
```

---

### Task 2: Implement `spec-storage.ts` to make Task 1's tests pass

**Files:**
- Create: `apps/web/src/storage/spec-storage.ts`

- [ ] **Step 1: Write the implementation**

```ts
// apps/web/src/storage/spec-storage.ts
import { get, set } from 'idb-keyval';
import type { Spec } from '@zwaggen/core';
import * as drafts from './drafts';
import * as fileIo from './file';

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
  loadDraft(): Promise<Spec | null>;
  saveDraft(spec: Spec): Promise<void>;
  clearDraft(): Promise<void>;

  supportsNativePicker(): boolean;
  pickOpen(): Promise<OpenedFile | null>;
  pickSave(suggestedName?: string): Promise<FileRef | null>;
  readFile(handle: FileRef): Promise<{ text: string; name: string }>;
  writeFile(handle: FileRef, text: string): Promise<void>;

  listRecent(): Promise<RecentFile[]>;
  recordRecent(entry: { name: string; handle?: FileRef }): Promise<void>;
}

const RECENTS_KEY = 'zwaggen:recents';
const RECENTS_LIMIT = 10;

async function listRecentImpl(): Promise<RecentFile[]> {
  return (await get<RecentFile[]>(RECENTS_KEY)) ?? [];
}

async function recordRecentImpl(entry: { name: string; handle?: FileRef }): Promise<void> {
  const current = await listRecentImpl();
  const filtered = current.filter((r) => r.name !== entry.name);
  const next: RecentFile[] = [
    { name: entry.name, openedAt: Date.now(), handle: entry.handle },
    ...filtered,
  ].slice(0, RECENTS_LIMIT);
  await set(RECENTS_KEY, next);
}

const browserDefault: SpecStorage = {
  loadDraft: drafts.loadDraft,
  saveDraft: drafts.saveDraft,
  clearDraft: drafts.clearDraft,

  supportsNativePicker: fileIo.supportsFileSystemAccess,

  async pickOpen() {
    const handle = await fileIo.pickOpen();
    if (!handle) return null;
    const { text, name } = await fileIo.readFile(handle);
    await recordRecentImpl({ name });
    return { handle, text, name };
  },
  pickSave: (suggestedName?: string) => fileIo.pickSave(suggestedName),
  readFile: (h: FileRef) => fileIo.readFile(h as FileSystemFileHandle),
  writeFile: (h: FileRef, text: string) => fileIo.writeFile(text, h as FileSystemFileHandle),

  listRecent: listRecentImpl,
  recordRecent: recordRecentImpl,
};

let active: SpecStorage = browserDefault;

export function getStorage(): SpecStorage { return active; }
export function setStorage(impl: SpecStorage): void { active = impl; }
export function resetStorage(): void { active = browserDefault; }
```

- [ ] **Step 2: Run Task 1's tests to verify they pass**

Run: `pnpm --filter web test -- spec-storage.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 3: Run web typecheck**

Run: `pnpm --filter web lint`
Expected: clean (existing baseline errors are unrelated to this change; no new errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/storage/spec-storage.ts
git commit -m "feat(web): introduce SpecStorage interface with browser default + recents"
```

---

### Task 3: Refactor `state/store.ts` to use `getStorage()`

**Files:**
- Modify: `apps/web/src/state/store.ts`

- [ ] **Step 1: Replace the imports**

Open `apps/web/src/state/store.ts`. Replace lines 3–5:

```ts
import { clearDraft, loadDraft, saveDraft } from '../storage/drafts';
import { FileHandle } from '../storage/file';
import { clearEndpointHistory, reconcileHistory } from '../storage/history';
```

with:

```ts
import { getStorage, type FileRef } from '../storage/spec-storage';
import { clearEndpointHistory, reconcileHistory } from '../storage/history';
```

- [ ] **Step 2: Rename `FileHandle` → `FileRef` in the interface**

In the `SpecStore` interface (lines 7–22), replace every `FileHandle` occurrence with `FileRef`:

```ts
interface SpecStore {
  spec: Spec;
  fileHandle: FileRef | null;
  dirty: boolean;
  selectedEndpointId: string | null;
  setSpec(next: Spec): Promise<void>;
  replaceSpec(next: Spec, handle: FileRef | null): Promise<void>;
  newSpec(): Promise<void>;
  markSaved(handle: FileRef | null): Promise<void>;
  restoreDraft(): Promise<boolean>;
  discardDraft(): Promise<{ reloadedFromFile: boolean }>;
  selectEndpoint(id: string | null): void;
  deleteEndpoint(id: string): Promise<void>;
  setTypeFolder(typeKey: string, folder: string | null): Promise<void>;
  setEndpointFolder(endpointId: string, folder: string | null): Promise<void>;
}
```

- [ ] **Step 3: Replace direct draft calls with `getStorage()` calls**

In each store method body, replace:
- `await saveDraft(next)` → `await getStorage().saveDraft(next)`
- `await clearDraft()` → `await getStorage().clearDraft()`
- `const draft = await loadDraft()` → `const draft = await getStorage().loadDraft()`

- [ ] **Step 4: Replace the lazy `readFile` import in `discardDraft`**

Currently lines 56–63:

```ts
if (handle) {
  // lazy-import to avoid a cycle with AppHeader
  const { readFile } = await import('../storage/file');
  const { fromJSON } = await import('@zwaggen/core');
  const { text } = await readFile(handle);
  set({ spec: fromJSON(JSON.parse(text)), dirty: false });
  await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
  return { reloadedFromFile: true };
}
```

Replace with:

```ts
if (handle) {
  const { fromJSON } = await import('@zwaggen/core');
  const { text } = await getStorage().readFile(handle);
  set({ spec: fromJSON(JSON.parse(text)), dirty: false });
  await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
  return { reloadedFromFile: true };
}
```

The cycle-avoiding lazy import is no longer needed because `spec-storage.ts` doesn't import from `AppHeader`.

- [ ] **Step 5: Run web tests**

Run: `pnpm --filter web test`
Expected: all green. The `state/store` is consumed across many tests; if any depended on the literal `FileHandle` name in error messages or types, fix them.

- [ ] **Step 6: Run web lint**

Run: `pnpm --filter web lint`
Expected: clean (no new errors).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/state/store.ts
git commit -m "refactor(web): route state/store draft + file ops through SpecStorage"
```

---

### Task 4: Refactor `ui/AppHeader.tsx` to use `getStorage()`

**Files:**
- Modify: `apps/web/src/ui/AppHeader.tsx`

- [ ] **Step 1: Replace the storage imports**

Open `apps/web/src/ui/AppHeader.tsx`. Find the import block around lines 14–23:

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

Replace with:

```ts
import { downloadBlob, uploadFile } from '../storage/file';
import { getStorage, type FileRef, type OpenedFile } from '../storage/spec-storage';
```

(`downloadBlob` is already imported separately or used inline — consolidate into one import line if needed. `uploadFile` stays as a direct import per spec out-of-scope reasoning.)

- [ ] **Step 2: Update each open flow**

There are three open flows in `AppHeader.tsx` (around lines 89–116, 119–140, 142–162). For each, the pattern was:

```ts
let handle: FileHandle | null;
if (supportsFileSystemAccess()) {
  const h = await pickOpen();
  if (!h) return;
  const r = await readFile(h);
  filename = r.name;
  text = r.text;
  handle = h;
} else {
  const up = await uploadFile();
  if (!up) return;
  filename = up.name;
  text = up.text;
  handle = null;
}
```

Replace with:

```ts
let handle: FileRef | null;
if (getStorage().supportsNativePicker()) {
  const opened: OpenedFile | null = await getStorage().pickOpen();
  if (!opened) return;
  filename = opened.name;
  text = opened.text;
  handle = opened.handle;
} else {
  const up = await uploadFile();
  if (!up) return;
  filename = up.name;
  text = up.text;
  handle = null;
}
```

Apply this pattern to all three flows: `openSpec`, `importOpenApi` (where the handle/filename may be discarded — read carefully), and `compareSpec`.

For `importOpenApi` and `compareSpec`, the existing code only needs `text` (no handle preserved). Adapt:

```ts
let text: string | null = null;
if (getStorage().supportsNativePicker()) {
  const opened = await getStorage().pickOpen();
  if (!opened) return;
  text = opened.text;
} else {
  const up = await uploadFile();
  if (!up) return;
  text = up.text;
}
```

- [ ] **Step 3: Update the save flow**

Around lines 164–188, replace:

```ts
if (fileHandle) {
  await writeFile(text, fileHandle);
  await markSaved(fileHandle);
  return;
}
if (supportsFileSystemAccess()) {
  const h = await pickSave();
  if (!h) return;
  await writeFile(text, h);
  await markSaved(h);
} else {
  downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.zwaggen.json');
  await markSaved(null);
}
```

with:

```ts
if (fileHandle) {
  await getStorage().writeFile(fileHandle, text);
  await markSaved(fileHandle);
  return;
}
if (getStorage().supportsNativePicker()) {
  const h = await getStorage().pickSave();
  if (!h) return;
  await getStorage().writeFile(h, text);
  await markSaved(h);
} else {
  downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.zwaggen.json');
  await markSaved(null);
}
```

Note the argument order change for `writeFile` — interface puts handle first.

- [ ] **Step 4: Sweep for residuals**

Run from worktree root:

```bash
grep -n "supportsFileSystemAccess\|pickOpen\|pickSave\|FileHandle" apps/web/src/ui/AppHeader.tsx
```

Expected: zero matches (apart from `getStorage().supportsNativePicker()` etc.). If any direct call remains, replace it.

- [ ] **Step 5: Run web tests**

Run: `pnpm --filter web test`
Expected: all green.

- [ ] **Step 6: Run web lint**

Run: `pnpm --filter web lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/AppHeader.tsx
git commit -m "refactor(web): route AppHeader file I/O through SpecStorage"
```

---

### Task 5: Verify nothing else broke

**Files:** none modified.

- [ ] **Step 1: Full web suite**

Run: `pnpm --filter web lint && pnpm --filter web test`
Expected: clean.

- [ ] **Step 2: Sanity check downstream packages aren't affected**

Run: `pnpm --filter @zwaggen/core lint && pnpm --filter @zwaggen/core test && pnpm --filter @zwaggen/cli lint`
Expected: clean (none of these import from `apps/web`, so they should be unaffected).

- [ ] **Step 3: Final residual sweep**

Run from worktree root:

```bash
grep -rn "from '../storage/drafts'" apps/web/src --include='*.ts' --include='*.tsx'
grep -rn "from '../storage/file'" apps/web/src --include='*.ts' --include='*.tsx'
```

Expected:
- `from '../storage/drafts'` should appear ONLY in `RunPanel.tsx`, `AppHeader.tsx` (for `loadSecrets`/`saveSecrets`), and `runner/batch.ts`. Not in `state/store.ts`.
- `from '../storage/file'` should appear in `AppHeader.tsx` (for `downloadBlob`/`uploadFile`) and `ExportMenu.tsx` (for `downloadBlob`). Not in `state/store.ts`.

- [ ] **Step 4: No commit** — verification only.

---

### Task 6: Tick TODO and move spec + plan to `done/`

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan from `active/` to `done/`

- [ ] **Step 1: Tick the TODO entry**

Open `docs/TODO.md`. Find the line:

```
- [ ] _(prep for Desktop)_ Storage abstraction in `apps/web` — interface for spec persistence + recent files; browser impl = current localStorage/OPFS behaviour; desktop impl lands with the desktop app itself.
```

Replace with:

```
- [x] _(prep for Desktop)_ Storage abstraction in `apps/web` — `SpecStorage` interface covers drafts + file I/O + recents; browser default delegates to existing `idb-keyval` + File System Access API; recents persisted at `zwaggen:recents` (capped at 10, no UI yet). See `docs/plans/done/2026-04-22-web-storage-abstraction.md`.
```

Update the "Last updated" date at the top to `2026-04-22 (web-storage-abstraction)`.

- [ ] **Step 2: Move spec and plan to done/**

```bash
git mv docs/specs/active/2026-04-22-web-storage-abstraction.md docs/specs/done/
git mv docs/plans/active/2026-04-22-web-storage-abstraction.md docs/plans/done/
```

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: ship web-storage-abstraction — move spec+plan to done, tick TODO"
```

---

## Self-Review Checklist (controller, after all tasks complete)

- All six tasks ticked.
- `pnpm --filter web lint && pnpm --filter web test` clean.
- No new exports beyond `SpecStorage`, `RecentFile`, `OpenedFile`, `FileRef`, `getStorage`, `setStorage`, `resetStorage`.
- Out-of-scope modules (`secrets`, `history`, `downloadBlob`, `uploadFile`, `uiPrefs`) untouched.
- Recents persistence works end-to-end — opening a file via `pickOpen` records an entry; the list caps at 10; dedupe by name keeps newest.
- Branch `plan/web-storage-abstraction` ready to push.
