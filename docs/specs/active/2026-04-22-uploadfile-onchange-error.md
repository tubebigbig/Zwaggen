# Spec — Stop `uploadFile` from swallowing I/O errors in onchange

## Problem

`apps/web/src/storage/file.ts`'s `uploadFile()` wraps the non-FSA file pick in a Promise:

```ts
return new Promise((resolve) => {
  const input = document.createElement('input');
  // ...
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return resolve(null);
    resolve({ text: await f.text(), name: f.name });
  };
  input.click();
});
```

Two issues:

1. **No `reject`.** If `f.text()` rejects (corrupt file, permission revoked, browser FileReader failure), the rejection surfaces inside the async `onchange` but there's no path to propagate it to the outer Promise. The outer Promise **never resolves** — it hangs forever. Symptom for the user: they click Open, pick a file, and the UI freezes silently.

2. **Async onchange + expression-in-argument evaluation order.** `resolve({ text: await f.text(), name: f.name })` awaits `.text()` before calling resolve. If the await rejects, the unhandled promise from the async `onchange` becomes an `unhandledrejection` console error in dev — no user-facing signal.

The `openSpec()` change shipped earlier today (`2026-04-21-open-spec-io-errors`) implicitly relies on `uploadFile` rejecting on I/O failure so the widened outer try/catch can route through `LoadErrorModal`. It does not today, so the modal never fires on the non-FSA path.

The load-error-modal + open-spec-io-errors code reviews flagged this as a pre-existing bug. File is filed as a TODO follow-up.

## Success criteria

- If the selected file's `.text()` rejects, `uploadFile()` rejects the outer Promise with that error.
- If the user cancels the native `<input>` dialog (onchange never fires because no file was selected in the first place — actually, onchange with `files=[]` → resolves null, which is the existing behavior and stays).
- If a file is successfully selected and read, `uploadFile()` resolves with `{ text, name }` — no behavioral change from today.
- Downstream: `AppHeader.openSpec()`'s widened catch (shipped in `open-spec-io-errors`) now routes rejections from `uploadFile` through `LoadErrorModal` with the error message.
- A unit test covers the rejection path (selected file whose `.text()` rejects → `uploadFile` rejects).
- No change to `pickOpen`, `readFile`, `writeFile`, `downloadBlob`, `pickSave`, or `supportsFileSystemAccess` — this fix is `uploadFile`-only.

## Out of scope

- The silent-hang-on-cancel case for the non-FSA fallback: there is no cancel event on `<input type="file">` — if the user closes the OS picker without selecting, `onchange` never fires and the Promise stays pending. Fixing that requires window-focus or `cancel` event heuristics that vary by browser. Out of scope for this plan.
- Migrating `importOpenApi` / `compareSpec` to the widened `openSpec` error-routing pattern — separate plan.
- Further refactor of `file.ts` (e.g., converting to await-based API).

## Approach

Add `reject` to the outer Promise, and wrap the async onchange body in try/catch that rejects on failure:

```ts
return new Promise((resolve, reject) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = async () => {
    try {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const text = await f.text();
      resolve({ text, name: f.name });
    } catch (err) {
      reject(err);
    }
  };
  input.click();
});
```

No other change in `file.ts`.

Test in a new file `apps/web/tests/storage/file.uploadFile.test.ts` — hook `document.createElement('input')` to intercept `.click()`, set `files` to a shim `File` whose `.text()` rejects, and assert `uploadFile()` rejects with the same error.
