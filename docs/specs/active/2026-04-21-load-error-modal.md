# Spec — User-facing load-error modal on Open Spec

## Problem

`apps/web/src/ui/AppHeader.tsx`'s `openSpec()` function (lines 70–94) wraps `fromJSON(JSON.parse(text))` inside `replaceSpec(...)` with **no** try/catch:

```tsx
await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(text))), h);
// and
await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(up.text))), null);
```

Two failure modes reach the user as silent no-ops:

1. `JSON.parse` throws a `SyntaxError` for malformed JSON — the promise rejects, the UI stays on the previous spec, no indicator fires.
2. `fromJSON` throws a `SpecVersionError` for missing/invalid/unsupported `schemaVersion` — same silent rejection. The error messages in `packages/core/src/schema/serialize.ts` (`messageFor()`) are already actionable, but the user never sees them.

Separate sites (`importOpenApi` at line 111, `compareSpec` at line 135) already use `alert()` for similar failures, but `openSpec` has nothing. `alert()` is a poor fit here anyway — the message can be long (schemaVersion mismatch text is ~120 chars) and the user benefits from a link to the versioning rule.

## Success criteria

- Opening a malformed JSON file via `Open` surfaces a dismissable modal that shows: the filename, the specific error message from `JSON.parse` / `SpecVersionError`, and a link to `docs/rules/spec-versioning.md` (GitHub URL).
- Opening a well-formed JSON file with a missing / non-integer / newer-than-supported `schemaVersion` shows the same modal with the `SpecVersionError` message verbatim (those messages are already user-friendly — reuse, don't rewrite).
- Dismissing the modal leaves the previously-loaded spec intact — the failed open must not mutate store state.
- Both English and zh-TW locales have the modal strings.
- A regression test covers both failure paths (JSON parse error + SpecVersionError).
- No change to `importOpenApi` or `compareSpec` — keeping scope tight; the new modal is reusable but only wired into `openSpec` here.

## Out of scope

- Migrating `importOpenApi` / `compareSpec` off `alert()` to the same modal. Follow-up if we ship this modal and want parity.
- Modal styling beyond what existing overlays (`DiffPanel`, `BatchRunPanel`) already use — same visual language, no new design system work.
- Error recovery (e.g., "fix my file for me") — out of scope. Modal is read-only advisory.

## Approach

Small, test-side-heavy.

1. New `LoadErrorModal` component in `apps/web/src/ui/LoadErrorModal.tsx` — a dismissable overlay matching the `DiffPanel` / `BatchRunPanel` shell style. Props: `filename: string`, `message: string`, `onClose: () => void`. Renders a link `https://github.com/tubebigbig/Zwaggen/blob/main/docs/rules/spec-versioning.md` under the error text.
2. `AppHeader.tsx`: add `const [loadError, setLoadError] = useState<{ filename: string; message: string } | null>(null);`. Wrap the `fromJSON(JSON.parse(text))` line in both branches of `openSpec` in try/catch; on catch call `setLoadError({ filename: h.name / up.name, message: err instanceof Error ? err.message : String(err) })`. Render `<LoadErrorModal ... />` at the bottom of the header JSX when non-null.
3. Add i18n keys `loadErrorTitle`, `loadErrorFilenameLabel`, `loadErrorLearnMore` (or similar) to `en.json` and `zh-TW.json`.
4. Test: new `apps/web/tests/ui/AppHeader.loadError.test.tsx` — mock `pickOpen`/`uploadFile`/`readFile` from `../../src/storage/file` and verify that (a) a malformed JSON file surfaces the modal with the SyntaxError message and the filename, (b) a file with `schemaVersion: 999` surfaces the `SpecVersionError` message, (c) dismissing the modal clears it, (d) the store's spec is unchanged after a failed open.
