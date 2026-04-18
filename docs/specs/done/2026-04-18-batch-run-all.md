# Batch "Run all" — run every endpoint from history, show a summary

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — new `runner/batch.ts`, new `BatchRunPanel`, `AppHeader`

## Problem

Pre-commit sanity checks are manual today. "Did I break any endpoint?" requires clicking each one in the sidebar and pressing Send. For specs with 20+ endpoints that's a ritual no one runs, so regressions get caught at PR review or after deploy.

The MVP explicitly deferred batch running. Now that we have `buildRequest`, `sendRequest`, type validation, assertions, and history, we can run the whole spec in one click and show a table.

## Goal

Add a "Run all" action that sends every endpoint sequentially using the most recent inputs we have for each (from Run history). Show a table of results with status / latency / validation / assertion chips. Endpoints with no history are skipped and surfaced separately so the user knows to run them manually once first.

## Non-goals

- **Not parallel.** Sequential is simpler, more reproducible, and respects rate limits. Parallel is a future flag.
- **Not "run from scratch without history"** (i.e., no input synthesis from schema / examples). Using history keeps inputs real. If an endpoint has never been run, the user runs it once to "teach" the batch.
- **Not per-environment matrix.** Runs against the currently active environment only.
- **Not stop-on-first-failure.** Batch always runs to completion; user gets the full picture.
- **Not CI-mode / exit-code emission.** Batch is an in-app affordance, not a test runner. A CLI mode is a separate feature.
- **Not writing results to the spec file.** Results live in UI state and optionally into history (each run pushes a new HistoryEntry like a manual Send would).
- **Not pre-request confirmation modals.** One click, go.

## Requirements

1. A "Run all" button lives in `AppHeader` next to Export. Clicking it:
   - Immediately disables itself and shows a running state.
   - Iterates endpoints in `spec.endpoints` order.
   - For each endpoint: loads its most recent `HistoryEntry` via `loadHistory(endpointId)`; if none, records a "skipped — no history" row and moves on.
   - If history exists, calls `buildRequest + sendRequest` with the stored inputs, evaluates type-validation + assertions, pushes a new HistoryEntry.
   - Updates a results table incrementally (each row rendered as it completes).
2. Results table columns: `METHOD path`, `status`, `latency`, `type ok/fail`, `assertion chips`, `run status` (one of `pending`, `running`, `done`, `skipped`, `errored`).
3. Skipped endpoints appear in the table with a single "no history yet" message in the status column; no chips.
4. While batch is running, the Run-all button label flips to "Stop" and clicking it cancels after the currently-in-flight request resolves (no mid-request abort).
5. Summary row at the top of the table: `N/M passed` where pass = (status 2xx AND type validated AND all assertions pass). Skipped endpoints don't count toward the denominator.
6. Results panel is a modal (or drawer) that the user can close; re-opening the batch UI between runs shows the most recent run's results until cleared.

## Design

### Core runner — `apps/web/src/runner/batch.ts` (new)

```ts
import type { Endpoint, Spec } from '../schema/types';
import type { RunResult } from './send';
import type { ValidationError } from '../validator/validate';
import type { AssertionResult } from './assertions';
import { buildRequest, sendRequest } from './send';
import { evaluateAssertions } from './assertions';
import { validate } from '../validator/validate';
import { loadHistory, pushHistory, trimResult } from '../storage/history';
import { loadSecrets } from '../storage/drafts';

export interface BatchRow {
  endpointId: string;
  method: string;
  path: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'errored';
  result?: RunResult;
  validationErrors?: ValidationError[];
  assertionResults?: AssertionResult[];
  passed?: boolean;
  skippedReason?: string;
}

export interface BatchHandle {
  rows: BatchRow[];       // initial set
  cancel(): void;
}

export async function runAll(
  spec: Spec,
  proxyUrl: string | undefined,
  onRowChange: (row: BatchRow) => void,
): Promise<{ cancel: () => void; done: Promise<void> }>;
```

The controller is a function that:
1. Synthesizes the initial `BatchRow[]` (one per endpoint, all `pending`).
2. Emits each row to `onRowChange` as its status transitions.
3. Returns a `cancel` that sets a flag; the loop checks after each request.
4. Returns a `done` promise that resolves when the loop exits (cancelled or completed).

Under the hood, for each endpoint:

```ts
const entries = await loadHistory(endpoint.id);
const last = entries[0];
if (!last) {
  emit({ ...row, status: 'skipped', skippedReason: 'no history yet' });
  continue;
}

emit({ ...row, status: 'running' });
const secrets = (await loadSecrets())[spec.activeEnvironment] ?? {};
const res = await sendRequest({
  spec, endpoint, baseUrl: last.baseUrlUsed,
  inputs: last.inputs,
  secrets,
  useProxy: last.useProxyUsed,
  proxyUrl,
});

// Validate
let validationErrors: ValidationError[] = [];
if (res.status != null) {
  const match = endpoint.responses.find((r) => r.status === res.status);
  if (match && res.body !== undefined) validationErrors = validate(spec, match.type, res.body);
}
const assertionResults = evaluateAssertions(res, endpoint.assertions);
const passed =
  res.ok &&
  validationErrors.length === 0 &&
  assertionResults.every((a) => a.passed);

// Record the run in history (same as manual Send)
await pushHistory({
  id: crypto.randomUUID(),
  at: Date.now(),
  endpointId: endpoint.id,
  inputs: last.inputs,
  baseUrlUsed: last.baseUrlUsed,
  useProxyUsed: last.useProxyUsed,
  result: trimResult(res, validationErrors),
});

emit({ ...row, status: 'done', result: res, validationErrors, assertionResults, passed });
```

**Cancellation semantics**: a `cancelled` flag checked at the top of each iteration. In-flight requests are not aborted; the batch stops *after* the current one resolves.

### UI — `apps/web/src/ui/BatchRunPanel.tsx` (new)

A modal (or panel — pick whichever matches the existing idiom; modal-over-backdrop is probably simplest) with:
- Header: "Run all — {N/M passed}" and a Close button.
- Stop / Run button in the header.
- Table body: one row per endpoint, updated live.
- Empty state: "No endpoints to run."

### AppHeader wiring

Add a button next to Export:

```tsx
<button className="btn" onClick={() => setBatchOpen(true)}>
  <IconPlay /> {t('runAll')}
</button>
```

`batchOpen` is AppHeader-level state; the modal renders when true.

### i18n keys

- en: `"runAll": "Run all"`, `"runAllStop": "Stop"`, `"noHistoryYet": "no history yet"`, `"runAllEmpty": "No endpoints to run."`, `"runAllSummary": "{{passed}}/{{total}} passed"`
- zh-TW: `"runAll": "全部執行"`, `"runAllStop": "停止"`, `"noHistoryYet": "尚無紀錄"`, `"runAllEmpty": "沒有可執行的端點。"`, `"runAllSummary": "{{passed}}/{{total}} 通過"`

## Testing

### Unit — `apps/web/tests/runner/batch.test.ts` (new)

- **All endpoints skipped** (no history for any): emits a skipped row per endpoint; never calls fetch.
- **One endpoint with history, one without**: fetch called once; second row marked skipped.
- **Passed vs failed**: fetch returns 200 with validating body and passing assertions → `passed: true`. Returns 404 → `passed: false`.
- **Cancellation**: mid-sequence cancel → loop stops after the current request; subsequent rows remain `pending`.
- **History is written**: after a successful run, `loadHistory(endpointId)` has one more entry.

Mock fetch with `vi.stubGlobal`. Seed history via direct `pushHistory`.

### Component — `apps/web/tests/ui/BatchRunPanel.test.tsx` (new)

- Opening the panel with two endpoints in spec: shows two rows (one per).
- After an endpoint completes: row status chip flips from pending to done with status code visible.
- Cancel button: clicking flips the UI to "cancelled" state; no more rows progress.
- Summary text updates as rows complete.

### AppHeader

- Clicking the Run-all button opens the panel; clicking Close dismisses it.

## Error handling

- Network error during a request: row status is `errored`, `passed: false`. The batch continues.
- Missing secrets: one `errored` row with the existing classify-error hint. Batch continues.
- Spec with zero endpoints: empty-state message, no action taken.

## Open questions

None. Future: per-environment matrix (`--env staging,prod`), parallel mode, exit-code CLI.
