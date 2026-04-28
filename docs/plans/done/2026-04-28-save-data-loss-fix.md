# Save flow data-loss fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop losing in-progress work when the user clicks Save but the actual file write doesn't happen (cancelled picker, write error, or download-blob fallback on browsers without File System Access API).

**Architecture:** Pure surgical changes — three small fixes in `file.ts`, `AppHeader.tsx`, and `store.ts`. Plus 4-5 tests. No new files except a tests folder.

**Tech Stack:** TypeScript, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-28-save-data-loss-fix.md`. Constraints:

- Cancel = silent no-op, draft survives.
- Write error = alert + draft survives.
- Download-blob fallback = draft survives, hint surfaced.
- `markSaved` clears draft before flipping `dirty: false`.

---

### Task 1: `pickSave` swallows AbortError + `markSaved` reorder

**Files:**
- Modify: `apps/web/src/storage/file.ts` — wrap `pickSave` (and `pickOpen` for consistency) in try/catch around `AbortError`.
- Modify: `apps/web/src/state/store.ts` — reorder `markSaved` so `clearDraft` runs first.
- Create: `apps/web/tests/storage/file.pickSave.test.ts`
- Create: `apps/web/tests/state/store.markSaved.test.ts`

- [ ] **Step 1: `pickSave` + `pickOpen` AbortError handling**

In `apps/web/src/storage/file.ts`:

```ts
export async function pickOpen(): Promise<FileHandle | null> {
  try {
    const [handle] = await (globalThis as any).showOpenFilePicker({
      types: [{ description: 'Zwaggen JSON', accept: { 'application/json': ['.json', '.zwaggen.json'] } }],
      multiple: false,
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function pickSave(suggestedName = 'spec.zwaggen.json'): Promise<FileHandle | null> {
  try {
    const handle = await (globalThis as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Zwaggen JSON', accept: { 'application/json': ['.json', '.zwaggen.json'] } }],
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}
```

- [ ] **Step 2: `markSaved` reorder**

In `apps/web/src/state/store.ts` (around line 75):

```ts
async markSaved(handle) {
  // Clear the draft FIRST so a tab close mid-flow doesn't leave us with
  // dirty=false + a stale draft (which would re-restore on next boot).
  await getStorage().clearDraft();
  set({ fileHandle: handle, dirty: false });
},
```

- [ ] **Step 3: Tests**

`apps/web/tests/storage/file.pickSave.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickSave, pickOpen } from '../../src/storage/file';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pickSave', () => {
  it('returns null when picker is cancelled (AbortError)', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(
      new DOMException('User cancelled', 'AbortError'),
    ));
    expect(await pickSave()).toBeNull();
  });

  it('propagates non-AbortError errors', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(pickSave()).rejects.toThrow('boom');
  });
});

describe('pickOpen', () => {
  it('returns null when picker is cancelled (AbortError)', async () => {
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockRejectedValue(
      new DOMException('User cancelled', 'AbortError'),
    ));
    expect(await pickOpen()).toBeNull();
  });
});
```

`apps/web/tests/state/store.markSaved.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { getStorage } from '../../src/storage/spec-storage';

describe('markSaved', () => {
  it('clears the draft before flipping dirty to false', async () => {
    // Seed a dirty spec so there's a draft to clear.
    await useSpecStore.getState().setSpec(emptySpec('Touched'));
    expect(useSpecStore.getState().dirty).toBe(true);

    const order: string[] = [];
    const realClearDraft = getStorage().clearDraft.bind(getStorage());
    const clearSpy = vi.spyOn(getStorage(), 'clearDraft').mockImplementation(async () => {
      order.push('clearDraft-start');
      await realClearDraft();
      order.push('clearDraft-end');
    });
    // Patch set so we can record when dirty flips
    const origState = useSpecStore.getState();
    const setSpy = vi.spyOn(useSpecStore, 'setState');

    await useSpecStore.getState().markSaved(null);

    expect(useSpecStore.getState().dirty).toBe(false);
    // The clearDraft call must complete BEFORE the dirty flip
    // (i.e., 'clearDraft-end' appears before any setState that flips dirty).
    // Easiest assertion: spy ordering. The setState call that flips dirty
    // must come AFTER 'clearDraft-end' was pushed.
    const dirtyFlipCallIdx = setSpy.mock.calls.findIndex(([arg]) => {
      const v = typeof arg === 'function' ? arg(origState) : arg;
      return v && (v as { dirty?: boolean }).dirty === false;
    });
    // clearDraft was called first
    expect(clearSpy).toHaveBeenCalled();
    // The setState that flips dirty must exist AND order array must show clearDraft-end was logged first
    expect(dirtyFlipCallIdx).toBeGreaterThanOrEqual(0);
    expect(order).toEqual(['clearDraft-start', 'clearDraft-end']);
  });
});
```

(The test is intentionally a little ceremony-heavy because we're asserting an ordering invariant. If it gets too clunky, simplify to: spy on `clearDraft`, after `markSaved` resolves verify `clearDraft` was called and `dirty=false` — drops the strict ordering assertion. Implementer's judgment.)

- [ ] **Step 4: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/save-data-loss-fix
pnpm install   # if node_modules empty
pnpm --filter web test
pnpm --filter web lint
```

All green. New tests pass; existing tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/storage/file.ts apps/web/src/state/store.ts apps/web/tests/storage/file.pickSave.test.ts apps/web/tests/state/store.markSaved.test.ts
git commit -m "$(cat <<'EOF'
fix(web): pickSave/pickOpen silent on AbortError + markSaved order

Cancelling the file picker no longer triggers an uncaught DOMException
in the Save button's click handler (browsers throw AbortError; the
helpers now return null cleanly). Non-AbortError still propagates.

markSaved now clears the IndexedDB draft BEFORE flipping dirty=false.
Eliminates a crash-window race where a tab close mid-flow could leave
dirty=false + a stale draft (which would re-restore on next boot).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `saveSpec` write-error + download-blob handling

**Files:**
- Modify: `apps/web/src/ui/AppHeader.tsx` — try/catch around `writeFile`; download-blob fallback no longer calls `markSaved`, surfaces a hint.
- Create: `apps/web/tests/ui/AppHeader.save.test.tsx`

- [ ] **Step 1: Patch `saveSpec`**

In `AppHeader.tsx`, replace the body of `saveSpec` (around lines 173-197):

```ts
async function saveSpec(opts?: { forceDialog?: boolean }) {
  const broken = collectBrokenRefs(spec);
  if (broken.length > 0) {
    alert(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`);
    return;
  }
  const onDisk = stripSecrets(spec);
  const existing = await loadSecrets();
  await saveSecrets({ ...existing, ...extractSecrets(spec) });
  const text = toJSON(onDisk);
  if (fileHandle && !opts?.forceDialog) {
    try {
      await getStorage().writeFile(fileHandle, text);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await markSaved(fileHandle);
    return;
  }
  if (getStorage().supportsNativePicker()) {
    const h = await getStorage().pickSave();
    if (!h) return;
    try {
      await getStorage().writeFile(h, text);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await markSaved(h);
  } else {
    downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.zwaggen.json');
    alert("Downloaded spec.zwaggen.json — your in-app draft is preserved. Use 'Open' to re-attach the file as your editing source.");
    // Intentionally NOT calling markSaved — there's no in-app file handle to associate,
    // and we want the draft to survive in case the user closes the tab without acting on
    // the download dialog.
  }
}
```

- [ ] **Step 2: Tests**

`apps/web/tests/ui/AppHeader.save.test.tsx`:

```ts
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import * as fileIo from '../../src/storage/file';

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
  // Force the spec to be dirty so Save proceeds
  await useSpecStore.getState().setSpec(emptySpec('Edited'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('Save → writeFile rejection surfaces alert + draft preserved', async () => {
  // FSA path: stub supports + pickSave returning a fake handle
  vi.spyOn(fileIo, 'supportsFileSystemAccess').mockReturnValue(true);
  const fakeHandle = {} as unknown as FileSystemFileHandle;
  vi.spyOn(fileIo, 'pickSave').mockResolvedValue(fakeHandle);
  vi.spyOn(fileIo, 'writeFile').mockRejectedValue(new Error('quota exceeded'));
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Save failed.*quota exceeded/));
  expect(useSpecStore.getState().dirty).toBe(true);
});

it('Save fallback (no FSA support) downloads blob, preserves draft, shows hint', async () => {
  vi.spyOn(fileIo, 'supportsFileSystemAccess').mockReturnValue(false);
  const downloadSpy = vi.spyOn(fileIo, 'downloadBlob').mockImplementation(() => {});
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(downloadSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Downloaded.*draft is preserved/));
  expect(useSpecStore.getState().dirty).toBe(true);
});

it('Save → cancelled picker is a no-op (no alert, draft preserved)', async () => {
  vi.spyOn(fileIo, 'supportsFileSystemAccess').mockReturnValue(true);
  vi.spyOn(fileIo, 'pickSave').mockResolvedValue(null);  // simulates AbortError-handled cancel
  const writeSpy = vi.spyOn(fileIo, 'writeFile');
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(writeSpy).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(useSpecStore.getState().dirty).toBe(true);
});
```

(Verify the actual mocking surface — `fileIo` exports may need to be re-examined. If `getStorage()` fully encapsulates `fileIo` so spying on `fileIo.writeFile` doesn't intercept, switch to spying on the `getStorage()` singleton's methods.)

- [ ] **Step 3: Verify**

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

All green; full suite up by ~3 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/ui/AppHeader.tsx apps/web/tests/ui/AppHeader.save.test.tsx
git commit -m "$(cat <<'EOF'
fix(web): saveSpec catches writeFile errors + preserves draft on download fallback

- Wraps both writeFile() call sites in try/catch; surfaces the error
  via alert (matches the existing broken-refs alert pattern). On
  failure markSaved isn't called, so the draft survives.
- Download-blob fallback (browsers without File System Access API)
  no longer calls markSaved. The blob downloads, an alert tells the
  user the in-app draft is preserved, and dirty stays true so a
  reload can recover. Closes the actual data-loss path that prompted
  this fix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move spec/plan + final smoke

**Files:**
- Move: spec + plan to `done/`.

This slice doesn't tick any line in `docs/TODO.md` (it's a bug fix, not a planned feature). Optionally add a note to TODO under "Fix" — see step 1.

- [ ] **Step 1: Add a Fix entry to docs/TODO.md (already-shipped style)**

Find the `## Fix` section near the top. Append:

```
- [x] Save flow data-loss bug — clicking Save without actually completing the file write (cancelled picker, write error, or download-blob fallback on non-FSA browsers) was clearing the IndexedDB draft. Now: cancel is a silent no-op, write errors surface via alert with the draft preserved, and the download-blob fallback keeps the draft and explicitly tells the user. `markSaved` reorders to clear-then-flip so a crash mid-flow doesn't leave dirty=false + stale draft. See `docs/plans/done/2026-04-28-save-data-loss-fix.md`.
```

- [ ] **Step 2: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-28-save-data-loss-fix.md docs/specs/done/
git mv docs/plans/active/2026-04-28-save-data-loss-fix.md docs/plans/done/
```

- [ ] **Step 3: Final smoke**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship save-data-loss-fix — log entry, move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 3 tasks ticked.
- `pickSave` + `pickOpen` swallow AbortError; non-AbortError still throws.
- `markSaved` clears draft before flipping `dirty: false`.
- `saveSpec` wraps both `writeFile` calls in try/catch; download-blob fallback preserves draft + shows hint.
- 5 new tests cover cancelled picker, write error, download-blob fallback, and `markSaved` ordering.
- All existing tests still pass.
- Spec + plan moved to `done/`.
- TODO entry logged under Fix.
- Branch `plan/save-data-loss-fix` ready to push.
