# Request assertions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Per-endpoint assertions (expected status, max latency, required response headers). Evaluated after each Send; results render as chips next to the existing type-validation chip.

**Spec:** `docs/specs/active/2026-04-18-request-assertions.md`

**Architecture:** Additive optional `Endpoint.assertions` + a pure `evaluateAssertions` in `runner/assertions.ts`. `RunPanel` calls it after `sendRequest` and threads results into its result state. Editor adds a card for entering the three fields. No change to `sendRequest`, no schema bump.

**Tech Stack:** existing only.

---

## Rules Applied
`spec-versioning.md` — additive optional field, no bump.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/schema/types.ts` | `Assertions` interface + `Endpoint.assertions?` |
| Create | `apps/web/src/runner/assertions.ts` | `AssertionResult` + `evaluateAssertions(res, a?)` |
| Modify | `apps/web/src/ui/EndpointEditor.tsx` | Assertions card |
| Modify | `apps/web/src/ui/RunPanel.tsx` | Evaluate on Send; render chips; extend result state |
| Modify | `apps/web/src/i18n/locales/en.json` + `zh-TW.json` | Keys |
| Create | `apps/web/tests/runner/assertions.test.ts` | Evaluator unit tests |
| Modify | `apps/web/tests/schema/serialize.test.ts` | Round-trip |
| Create | `apps/web/tests/ui/EndpointEditor.assertions.test.tsx` | Editor tests |
| Create | `apps/web/tests/ui/RunPanel.assertions.test.tsx` | Chip rendering tests |

---

## Tasks

### Task 1: Schema + evaluator

**Files:** `types.ts`, `assertions.ts` (new), `serialize.test.ts`, `assertions.test.ts` (new)

- [ ] Add to `types.ts`:
  ```ts
  export interface Assertions {
    expectedStatus?: number;
    maxLatencyMs?: number;
    requiredHeaders?: Array<{ name: string; value: string }>;
  }
  // inside Endpoint:
  assertions?: Assertions;
  ```
- [ ] Create `apps/web/src/runner/assertions.ts`:
  - `import type { RunResult } from './send'`
  - `import type { Assertions } from '../schema/types'` (single source).
  - Export `interface AssertionResult { kind: 'status' | 'latency' | 'header'; passed: boolean; message: string }`.
  - Export `evaluateAssertions(res, a?)`:
    - Returns `[]` if `a` is undefined.
    - Status check only when `a.expectedStatus !== undefined`.
    - Latency check only when `a.maxLatencyMs !== undefined` AND `res.latencyMs !== undefined`.
    - Header checks lowercase the header-name lookup (case-insensitive), compare values exactly.
    - Messages:
      - Status pass: `"Status 200"`. Fail: `"Expected 200, got 404"` or `"Expected 200, got ?"` when status missing.
      - Latency pass: `"≤ 200ms (45ms)"`. Fail: `"Too slow: 300ms > 200ms"`.
      - Header pass: `"content-type: application/json"`. Fail: missing → `"Missing X-Custom"`; wrong value → `"content-type: expected \"application/json\", got \"text/html\""`.
- [ ] Evaluator tests covering every case listed in the spec.
- [ ] Serialize round-trip tests: spec with assertions persists; spec without has no `"assertions"` key.
- [ ] Commit: `feat(runner): evaluateAssertions + Endpoint.assertions schema field`.

### Task 2: EndpointEditor card

**Files:** `EndpointEditor.tsx`, locale files, `EndpointEditor.assertions.test.tsx` (new)

- [ ] Read `EndpointEditor.tsx`. Slot the assertions card after the Responses section.
- [ ] Card content:
  - Expected Status `<input type="number">` bound to `endpoint.assertions?.expectedStatus`. Empty → undefined.
  - Max Latency (ms) `<input type="number">` bound to `.maxLatencyMs`. Empty → undefined.
  - Required Headers rows: name + value inputs, `+ Add header` button, `×` per row. Drop the entire `requiredHeaders` key when the array empties.
- [ ] Use a single helper:
  ```ts
  function patchAssertions(next: Partial<Assertions>) {
    const current = endpoint.assertions ?? {};
    const merged = { ...current, ...next };
    const isEmpty = merged.expectedStatus === undefined
                 && merged.maxLatencyMs === undefined
                 && !merged.requiredHeaders?.length;
    const { assertions: _, ...rest } = endpoint;
    updateEndpoint(isEmpty ? rest : { ...rest, assertions: merged });
  }
  ```
  (Adapt to whatever update helper the file already exposes.)
- [ ] i18n keys (both locales):
  - en: `"assertions": "Assertions"`, `"expectedStatus": "Expected status"`, `"maxLatencyMs": "Max latency (ms)"`, `"requiredHeaders": "Required headers"`, `"addHeader": "Add header"`
  - zh-TW: `"assertions": "斷言"`, `"expectedStatus": "預期狀態碼"`, `"maxLatencyMs": "最大延遲 (ms)"`, `"requiredHeaders": "必要回應標頭"`, `"addHeader": "新增標頭"`
- [ ] Component tests:
  - Type `200` in expected-status → `endpoint.assertions.expectedStatus === 200`.
  - Clear all fields → `'assertions' in endpoint === false`.
  - Add + fill a header row → stored.
  - Remove last header row → `requiredHeaders` key dropped (or empty array; pick one and assert that).
- [ ] Commit: `feat(web): endpoint assertions editor`.

### Task 3: RunPanel chips

**Files:** `RunPanel.tsx`, `RunPanel.assertions.test.tsx` (new)

- [ ] Import `evaluateAssertions` and `AssertionResult`.
- [ ] Extend the `result` state shape:
  ```ts
  setResult({
    res,
    validationErrors,
    note,
    assertionResults: evaluateAssertions(res, endpoint!.assertions),
  });
  ```
- [ ] In `RunResultView`, after the existing type-validation chip, map `assertionResults` into chips:
  - Green (pass) / red (fail), title=message, short icon per kind.
  - If any fail, apply the same "amber" border treatment used for type errors (reuse the existing class).
- [ ] Tests (mock fetch):
  - 200 + content-type JSON + 50ms, assertions match → 3 green chips.
  - 404 response, expected 200 → red chip with "Expected 200, got 404" title.
  - Latency 500ms, expectedMax 100ms → red chip.
  - No assertions declared → no chips render.
- [ ] Commit: `feat(web): render assertion chips next to type-validation chip`.

### Task 4: E2E + docs move

- [ ] `pnpm e2e` green.
- [ ] `git mv` spec + plan to done/. Commit.

---

## Open Questions
None.
