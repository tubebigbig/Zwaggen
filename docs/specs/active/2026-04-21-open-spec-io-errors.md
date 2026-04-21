# Spec — Cover I/O errors in `AppHeader.openSpec`

## Problem

The load-error-modal just shipped (`docs/plans/done/2026-04-21-load-error-modal.md`) wraps only the parse + `fromJSON` step in try/catch:

```tsx
let parsed: Spec;
try {
  parsed = fromJSON(JSON.parse(text));
} catch (err) { setLoadError(...); return; }
await replaceSpec(await hydrateSecrets(parsed), handle);
```

Everything before that (`pickOpen()`, `readFile()`, `uploadFile()`) and after (`hydrateSecrets()`, `replaceSpec()`) can still reject silently, reproducing the exact symptom the modal was meant to eliminate:

1. **User cancels the native picker.** `showOpenFilePicker` rejects with `DOMException { name: 'AbortError' }`. Today that bubbles to `void openSpec()`, producing an unhandled-promise-rejection in the browser console but no UI signal. Functionally a no-op for the user — which is the *correct* behaviour for cancellation — but we're doing it through a rejection, not a clean return.
2. **`readFile` rejects.** File deleted between picker and read; permission revoked via browser prompts; the handle became stale. Silent rejection today.
3. **`hydrateSecrets` / `replaceSpec` rejects.** `loadSecrets` hits a corrupt IndexedDB; `replaceSpec` internally touches storage (see `state/store.ts`). Low probability, but it lands the user with half-applied state today — `replaceSpec` can throw after committing to the store.

The code-quality reviewer flagged this during the load-error-modal code review — filed as a follow-up TODO.

## Success criteria

- User cancelling the native `showOpenFilePicker` dialog (or the upload `<input>` fallback — already `null`-returning today, so no change) leaves everything untouched: no console rejection, no modal, no store mutation.
- Any non-`AbortError` failure during I/O (read, hydrate, replace) surfaces through the existing `LoadErrorModal` with a best-available filename and the error's `.message`. When the error occurred before a filename was captured, the modal shows an em-dash placeholder for the filename row.
- `fromJSON` / `JSON.parse` still work the same — no regression in the three tests already covering that path.
- Two new regression tests: user-cancel (AbortError → silent no-op, modal absent, store unchanged) and `readFile` reject (modal shown with the rejected filename + error message).
- No change to `importOpenApi`, `compareSpec`, or `saveSpec` — those still live with their own ad-hoc handling; broader cleanup is out of scope.

## Out of scope

- Migrating `importOpenApi`, `compareSpec`, or `saveSpec` to the same modal. These still use `alert()` / bespoke UI. Separate plan if and when we decide to unify.
- Adding an error class / taxonomy (e.g., distinguishing "I/O" vs "parse" to the user). The modal already shows the raw `.message`; that's enough.
- Fixing `uploadFile`'s silent-hang-on-cancel (the `<input>` fallback has no cancel event; if the user aborts the native dialog, `onchange` never fires). Would need a refactor; not triggered by this TODO.
- The focus-management follow-up filed at the same time — separate item on TODO.

## Approach

Single try/catch around the entire body of `openSpec`, including `pickOpen`/`readFile`/`uploadFile`, the parse + `fromJSON`, and `hydrateSecrets` + `replaceSpec`. Track `filename` in a `let` that starts empty and is updated once known. In the catch:

```tsx
if (err instanceof Error && err.name === 'AbortError') return;
setLoadError({
  filename: filename || '—',
  message: err instanceof Error ? err.message : String(err),
});
```

Remove the existing inner try/catch for `fromJSON` — it's subsumed by the outer one. The error-class inspection for `AbortError` uses `.name` because `DOMException` doesn't share `instanceof` across some test environments (jsdom/happy-dom).

The modal's `filename` prop becomes a free-form label; the "—" fallback is a display-only string, not a separate flag. That means the `LoadErrorModal` component itself needs no change — just the caller.

No production-code changes outside `AppHeader.tsx`. Tests-side addition only.
