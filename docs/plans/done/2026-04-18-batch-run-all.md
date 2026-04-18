# Batch "Run all" — Implementation Plan

**Spec:** `docs/specs/active/2026-04-18-batch-run-all.md`

**Goal:** "Run all" button reruns every endpoint from its most recent history entry, displays a live-updating results table with pass/fail summary, and records each run in history.

**Architecture:** New `runner/batch.ts` orchestrates. UI panel reads emitted row events. No changes to `sendRequest`, `buildRequest`, `validate`, or `evaluateAssertions`.

---

## Tasks

### Task 1: `runAll` core

**Files:**
- Create: `apps/web/src/runner/batch.ts`
- Create: `apps/web/tests/runner/batch.test.ts`

- [ ] Export `BatchRow` and `runAll(spec, proxyUrl, onRowChange): Promise<{ cancel, done }>`.
- [ ] Iterate `spec.endpoints`; emit `pending` → `running` / `skipped` → `done` / `errored` per row.
- [ ] Per endpoint: `loadHistory(id)`, take `[0]` if present, else emit skipped.
- [ ] If present: `loadSecrets()` for active env, `sendRequest({...fromHistory})`, `validate(...)` against matching `endpoint.responses[i].type`, `evaluateAssertions(res, endpoint.assertions)`. Compute `passed = res.ok && validationErrors.length === 0 && assertions.every(a => a.passed)`.
- [ ] `pushHistory(...)` with trimmed result after each successful call.
- [ ] Cancellation: `cancelled` flag checked at top of each loop iteration.
- [ ] Tests (mock fetch + `fake-indexeddb/auto`):
  - All skipped when no history.
  - One with history, one without → one fetch + one skipped.
  - Passed vs failed distinguishable.
  - Cancel mid-sequence leaves later rows pending.
  - History grows by one per completed row.
- [ ] Commit: `feat(runner): runAll batch executor replaying from history`.

### Task 2: `BatchRunPanel` UI

**Files:**
- Create: `apps/web/src/ui/BatchRunPanel.tsx`
- Modify: `apps/web/src/ui/AppHeader.tsx`
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json`
- Create: `apps/web/tests/ui/BatchRunPanel.test.tsx`

- [ ] `BatchRunPanel({ spec, onClose }: { spec: Spec; onClose(): void })`:
  - Local state: `rows: BatchRow[]`, `running: boolean`, `handle: { cancel: () => void } | null`.
  - On mount (or on "Run" click), call `runAll(spec, undefined, (row) => setRows(prev => prev.map(r => r.endpointId === row.endpointId ? row : r)))`.
  - Initial rows synthesized from `spec.endpoints` in `pending` state.
  - Stop button: calls `handle?.cancel()`.
  - Close button: cancel + unmount.
  - Table rendering per spec.
- [ ] `AppHeader.tsx`: add "Run all" button (use `IconPlay` if present else add). Wire `batchOpen` state, render `<BatchRunPanel>` conditionally. Close button dismisses.
- [ ] i18n keys per spec in both locales.
- [ ] Tests:
  - Open panel with 2 endpoints → 2 rows rendered.
  - After a fake row-change emits `done`, that row's status chip updates.
  - Cancel button triggers `handle.cancel()` (spy).
  - Summary count updates.
- [ ] Commit: `feat(web): Run all panel with live results table`.

### Task 3: e2e + docs move

- [ ] `pnpm e2e`. Fix selectors only if the new button adds ambiguity (e.g., on `Method` or similar).
- [ ] `git mv` spec + plan to `done/`. Commit.
