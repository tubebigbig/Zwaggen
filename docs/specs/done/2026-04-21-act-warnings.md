# Spec — Eliminate React act(...) warnings in web tests

**Date:** 2026-04-21
**Scope:** `apps/web` test suite only
**Type:** Fix (from `docs/TODO.md` §Fix)

## Problem

`pnpm --filter web test` passes (248/248) but emits React `act(...)` warnings to stderr from two tests. The warnings clutter CI output and mask real test-side regressions.

Observed today:

1. `tests/ui/TypePanel.test.tsx > add and rename a type updates refs`
   - Stack: `ExtendsPicker` → `ObjectControls` → `TypePanel` all warn.
   - Root cause: line 26 `input.blur()` is a **raw DOM call**, not wrapped by `userEvent` / `act`. The `onBlur` handler dispatches a store `rename` → `setSpec`, which synchronously re-renders the TypeBuilder subtree while React is outside an `act` scope.

2. `tests/ui/RunPanel.test.tsx > resyncs the Base URL input when spec.info.baseUrl changes`
   - Stack: `RunPanel` (twice) and `HistoryDrawer` warn.
   - Root causes:
     a. `HistoryDrawer`'s mount effect calls `loadHistory(endpointId).then(setEntries)`. The IndexedDB promise resolves **after** `render()` returns, so `setEntries` fires outside `act`.
     b. `await useSpecStore.getState().setSpec({...})` at line 37 runs `set(...)` synchronously and then awaits `saveDraft`. React subscribers re-render synchronously with the new spec, but the `await` returns control to the test without an enveloping `act`, and the follow-on `useEffect` in `RunPanel` that resyncs `baseUrl` fires outside `act`.

## Non-goals

- Do **not** change production code (`RunPanel.tsx`, `HistoryDrawer.tsx`, `TypeBuilder.tsx`, `store.ts`). The warnings are test-side; production behaviour is correct.
- Do **not** suppress the warning globally (e.g. filter console in `vitest.setup.ts`) — that hides future regressions.
- Do **not** refactor the tests beyond what's needed to clear the warnings.

## Success criteria

1. `pnpm --filter web test` prints **zero** lines containing `"An update to"` or `"wrapped in act"` on stderr.
2. All 248 tests still pass.
3. No new `eslint-disable` or `@ts-ignore` introduced.
4. Diff is confined to the two test files named above.

## Verification

Run from repo root:

```bash
pnpm --filter web test 2>&1 | grep -E "act\(|An update to" | wc -l
```

Expected: `0`.

And:

```bash
pnpm --filter web test
```

Expected: `Tests  248 passed (248)`.

## Out of scope / follow-ups

- The production-side async-without-act pattern in `HistoryDrawer` (bare `loadHistory().then(setEntries)`) is safe in the browser but fragile in tests. If warnings reappear in other tests, consider threading an `AbortController` or switching to a React-query-style hook — but that is its own plan, not this one.
