# Zwaggen — Open TODO

Cross-cutting items that don't belong to one active plan. Use this as the resume point in a new session.

Last updated: 2026-04-18

## Repo state

- **74 commits ahead of `origin/main`**, not pushed. Decide whether to push before starting new work.
- Working tree: clean (all 13 feature plans + polish sweep merged to `main`).
- Tests: `pnpm --filter @zwaggen/web test` → 374/374 green at `434adda`.

## Need to fix

### React `act(...)` warnings in tests
- Where: `TypePanel.test.tsx`, `RunPanel.test.tsx` (and possibly others that touch Zustand + async state).
- Symptom: warnings printed during `pnpm test` but tests pass. Non-fatal.
- Likely cause: state updates triggered by effects/async handlers that land outside the `render()` act boundary.
- Fix shape: wrap the trigger in `await act(async () => { ... })`, or `await screen.findBy...` on the resulting UI instead of `getBy...` to force React to flush.
- Low priority but worth cleaning before a future plan depends on stable test output.

### Known deprecations — none outstanding
- `navigator.platform` already replaced with `navigator.userAgent` regex in copy-as-cURL.

## Needs manual verification

None of the shipped plans have been exercised in a real browser by a human yet. All were verified via:
- Unit tests (Vitest + Testing Library)
- E2E tests (Playwright) where applicable
- Spec-reviewer + code-quality-reviewer subagents

Still worth a manual UX pass across:
- OpenAPI import warning banner (edge cases: oneOf, deep $ref, huge specs).
- Batch run modal on a spec with many endpoints (layout + cancel button).
- Diff panel with a realistic breaking change set (readability of the grouped list).
- Response chaining captures across multiple endpoints (does the secret mask render correctly in UI and in copy-as-cURL?).
- Run history drawer trimming behavior on a 100KB+ response body.
- i18n zh-TW pass on every new modal/panel (a native reader should skim).

## Proposed next features (unpicked)

Surfaced at end of last round, awaiting user pick:

1. **CI-mode CLI for batch + diff** — headless `zwaggen run <spec>` and `zwaggen diff <a> <b>` reusing `runner/batch.ts` + `schema/diff.ts`. Enables GitHub Actions checks.
2. **Saved request presets** — per-endpoint named parameter sets (e.g., "admin user", "empty cart") stored in the spec; quick-fill in RunPanel.
3. **Per-environment `servers[]`** — today `Spec.info.baseUrl` is single; some teams want `prod`/`staging`/`local` URLs selected alongside the active environment.
4. **Header capture + JSONPath filter expressions** — extend `Capture` beyond dot-path on body to also read response headers and run filters like `$.items[?(@.id==42)].token`.

## Leftover from the original PM brainstorm

The opening PM-mode list had 13 items; 12 shipped. Still open:

- **Postman collection import** — mirror of `importers/openapi.ts` for Postman v2.1 collections. Map collection items → endpoints, environments → `environments`, auth helpers → `AuthPreset`. Emit warnings for unsupported script blocks (`pm.test`, `pm.sendRequest`). Lower priority than OpenAPI since Postman users can export to OpenAPI first.

Pick any; I'll draft the spec + plan and run it.

## Follow-ups from shipped work

- `schema/diff.ts` uses `JSON.stringify` for type equality. Fine for MVP but misses semantic equivalence (key order, whitespace in patterns). If users complain about noisy diffs, swap to a canonical stringifier or a structural comparator.
- `runner/batch.ts` replays from history, not from a fresh run. Intentional (no duplicate network traffic) but may confuse users who expect "run all" to mean "hit every endpoint right now". Consider a toggle if feedback warrants it.
- `importers/openapi.ts` emits warnings but does not preserve `x-*` extensions. Add if users ask.
