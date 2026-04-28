# Spec — Save flow data-loss fix

## Problem

Reported by the user: clicking the Save button "but not actually saving the file" loses progress. Investigation traced 4 issues that combine to break the save flow:

1. `pickSave()` (in `apps/web/src/storage/file.ts:15-21`) calls the browser's `showSaveFilePicker` without try/catch. When the user cancels the file picker, the browser throws `AbortError` (a `DOMException`) — the promise rejects, the Save button's click handler `void`s the result, no UX feedback. (Draft IS still in IndexedDB so a reload restores, but the user has no signal the save didn't happen.)
2. `writeFile()` errors are uncaught (`AppHeader.tsx:191`). Disk full / permission denied / quota / network errors silently fail.
3. **The actual data-loss path**: on browsers without File System Access API support (Safari, Firefox without flag), Save calls `downloadBlob(...)` then `markSaved(null)` (`AppHeader.tsx:194-195`). `markSaved` clears the IndexedDB draft. If the user closes the tab without acting on the download dialog (or the download fails), in-progress work is gone with no recovery path — there's no `fileHandle` to re-open from.
4. (minor) Race in `markSaved()` (`apps/web/src/state/store.ts:75-78`): `set({ dirty: false })` runs synchronously BEFORE `await clearDraft()` resolves. If the tab crashes between those statements, the next boot finds `dirty=false` AND a stale draft — confusing.

## Success criteria

- **Cancel the picker**: `pickSave()` swallows `AbortError` cleanly. Save button click is a silent no-op (no console error, no UX disruption). The IndexedDB draft survives.
- **Write fails**: `writeFile()` errors surface via `alert(...)` with the underlying message. The IndexedDB draft survives. `markSaved` is NOT called (so `dirty` stays true and `fileHandle` doesn't change).
- **Download-blob fallback** (no FSA support): the download fires AND the in-app spec stays `dirty: true` with the draft preserved. A one-shot `alert()` (or similar lightweight surface) tells the user *"Downloaded `spec.zwaggen.json` — your in-app draft is still preserved. Use 'Open' to re-attach the file as your editing source."* No `markSaved` call.
- **`markSaved` ordering**: `await clearDraft()` happens BEFORE `set({ fileHandle, dirty: false })`. Eliminates the crash-window race.
- Tests cover:
  - `pickSave()` returns null on `AbortError` (mock `showSaveFilePicker` to throw).
  - `writeFile()` rejection from `saveSpec` surfaces as alert + draft preserved (mock `writeFile` to throw).
  - Download-blob fallback path keeps `dirty: true` and does NOT clear the draft.
  - `markSaved` clears the draft before flipping `dirty` to false.
- No new i18n keys required for v1 (alert text is English-only — matches existing alert patterns in the file). If the user wants localization later, easy follow-up.

## Out of scope

- A toast/notification system to replace `alert()` for save errors. The existing pattern (broken-refs alert at `AppHeader.tsx:176`) uses native `alert()`; staying consistent.
- Persisting the FSA `FileSystemFileHandle` across page reloads (Chromium supports this with permission re-prompt; out of scope for this fix).
- Auto-save to file when a `fileHandle` is set (would address a related "I forgot to save" complaint, but it's a different feature).
- Localizing the new alert messages (en + zh-TW). Keep minimal — match the pattern of existing alerts.

## Approach

### `pickSave` — silent on AbortError

In `apps/web/src/storage/file.ts`:

```ts
export async function pickSave(suggestedName = 'spec.zwaggen.json'): Promise<FileHandle | null> {
  try {
    const handle = await (globalThis as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Zwaggen JSON', accept: { 'application/json': ['.json', '.zwaggen.json'] } }],
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;  // unknown errors still bubble
  }
}
```

Apply the same shape to `pickOpen()` in the same file (already returns null but uses destructuring that would also throw if the array is empty — harden while we're here).

### `saveSpec` — try/catch around writeFile

In `apps/web/src/ui/AppHeader.tsx`:

```ts
async function saveSpec(opts?: { forceDialog?: boolean }) {
  // ...existing pre-flight (broken refs, secrets) unchanged...
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
    // NOTE: do NOT call markSaved — there's no in-app file handle to associate, and we want
    // the draft to survive in case the user closes the tab without saving the download.
  }
}
```

### `markSaved` — clear draft first

In `apps/web/src/state/store.ts`:

```ts
async markSaved(handle) {
  await getStorage().clearDraft();  // do this first so a crash mid-flow doesn't leave dirty=false + draft
  set({ fileHandle: handle, dirty: false });
}
```

### Tests

`apps/web/tests/storage/file.pickSave.test.ts`:

```ts
test('pickSave returns null when picker is cancelled (AbortError)', async () => {
  vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(
    Object.assign(new DOMException('User cancelled', 'AbortError'))
  ));
  expect(await pickSave()).toBeNull();
});

test('pickSave propagates non-AbortError', async () => {
  vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new Error('boom')));
  await expect(pickSave()).rejects.toThrow('boom');
});
```

`apps/web/tests/ui/AppHeader.save.test.tsx`:

```ts
test('Save → writeFile rejection surfaces alert + draft preserved', async () => {
  // Mount AppHeader, seed dirty spec, mock writeFile to throw, click Save.
  // Assert: alert was called with the error message; useSpecStore.dirty stays true.
});

test('Save fallback (no FSA) downloads blob, preserves draft, shows hint', async () => {
  // Stub supportsFileSystemAccess to false; mock downloadBlob; click Save.
  // Assert: downloadBlob called once; useSpecStore.dirty stays true; draft NOT cleared.
});
```

`apps/web/tests/state/store.markSaved.test.ts`:

```ts
test('markSaved clears the draft before flipping dirty to false', async () => {
  // Spy on getStorage().clearDraft and assert it resolves before dirty becomes false.
  // Easiest: use an awaitable order spy that records the sequence.
});
```

If full integration of the AppHeader test gets gnarly (alert + downloadBlob + storage mocks), drop to a unit-level test on a refactored helper. Implementer's call.

### Risks

- **Locale of the new alert** — uses English. Consistent with the existing broken-refs alert (`AppHeader.tsx:176`). If we later move alerts to a centralized localized toast system, both get migrated together.
- **`alert()` in tests** — vitest's jsdom environment stubs `window.alert` to a no-op; tests should `vi.spyOn(window, 'alert')` to assert it was called.
- **`markSaved` ordering reverse** is a behavioral change (subtle): currently the UI sees `dirty: false` while `clearDraft` is still pending. After the fix, `clearDraft` blocks dirty change. Side effect: a renderer that subscribes to `dirty` might see a brief delay before the indicator clears. Acceptable — `clearDraft` resolves in ~ms via IndexedDB.

## Done definition

- `pickSave` (and `pickOpen`) handle `AbortError` cleanly.
- `saveSpec` wraps `writeFile` in try/catch with alert.
- Download-blob fallback preserves the draft + shows a hint.
- `markSaved` clears the draft before flipping `dirty`.
- 4-5 tests cover the new branches.
- All existing tests still pass.
- Spec + plan moved to `done/`.
- Branch `plan/save-data-loss-fix` pushed.
