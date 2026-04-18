# Request assertions — status / latency / header expectations per endpoint

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — schema + `EndpointEditor` + `runner/` + `RunPanel` response view

## Problem

Type validation catches shape mismatches in the response body but misses three categories of regression that users care about:

1. **Wrong status code.** A 200 OK arrives, the body validates, but the endpoint was supposed to 404 — type validation is silent because no declared type matches the 200.
2. **Latency regression.** The response is correct but 6× slower than usual. The app surfaces a latency chip but no way to set an expected ceiling.
3. **Missing / wrong headers.** `content-type: text/html` instead of `application/json`, or a missing `cache-control`. Teams noticed these via monitoring, not during dev.

Today's workaround: eyeball every run. Zwaggen already owns the response view; it just needs declared expectations to mark.

## Goal

Add an optional `assertions` block to each endpoint: expected status, max latency, required response headers. Evaluate after every Send. Results render as small chips next to the existing type-validation chip in `RunPanel`'s response summary — green pass, red fail, with a hover tooltip explaining the mismatch.

## Non-goals

- **Not JSONPath / JS-expression assertions.** No `response.body.users[0].name === "alice"`. Those belong in a test framework, not an exploratory client. Type validation already covers shape.
- **Not multi-header regex.** Header assertions are exact case-insensitive value matches. Regex can come later.
- **Not min-latency / percentile / histogram.** Just a max. Users who need more should hit their APM.
- **Not per-response-status assertions.** Assertions live at the endpoint level and apply to whatever response comes back. If you 500 instead of 200, the assertions all still evaluate against that 500.
- **Not pre-request assertions** (checking inputs before sending). Those belong in param validation — a separate feature.

## Requirements

1. `Endpoint.assertions?: Assertions` where `Assertions` is:
   ```ts
   export interface Assertions {
     expectedStatus?: number;
     maxLatencyMs?: number;
     requiredHeaders?: Array<{ name: string; value: string }>;
   }
   ```
   No schema-version bump (all optional; `JSON.stringify` drops `undefined`).
2. **Editor**: a collapsible "Assertions" card in `EndpointEditor` (below or beside Responses). Three inputs:
   - Expected status: numeric input, empty = no assertion.
   - Max latency (ms): numeric input, empty = no assertion.
   - Required headers: name/value rows (similar to existing `ParamTable` UX), with +/× to add/remove rows.
3. **Evaluator**: pure function `evaluateAssertions(res: RunResult, a?: Assertions): AssertionResult[]`. Each `AssertionResult` is `{ kind: 'status' | 'latency' | 'header'; passed: boolean; message: string; detail?: string }`. Runs *only* when at least one field on `Assertions` is non-empty; skipped entries produce no result.
4. **Header matching**: case-insensitive on header name, exact match on value. Expected value `"application/json"` matches `Content-Type: application/json` and `content-type: application/json`.
5. **Display**: `RunPanel` renders each assertion result as a chip next to the existing type-ok/type-errors chip in the response summary row. Chip color: green for pass, red for fail. Tooltip shows the human message. Failures count toward the "overall not-ok" styling of the result card.
6. **No impact on type validation**: assertions and type validation are independent. A run can have type ok + assertion fail, or both fail, or both pass.
7. **No runner change**: assertions run in `RunPanel` after `sendRequest` returns, the same place type validation runs. `sendRequest` signature untouched.

## Design

### Schema — `apps/web/src/schema/types.ts`

```ts
export interface Assertions {
  expectedStatus?: number;
  maxLatencyMs?: number;
  requiredHeaders?: Array<{ name: string; value: string }>;
}

export interface Endpoint {
  // …existing
  assertions?: Assertions;
}
```

### Evaluator — `apps/web/src/runner/assertions.ts` (new)

```ts
import type { RunResult } from './send';

export interface AssertionResult {
  kind: 'status' | 'latency' | 'header';
  passed: boolean;
  message: string;
}

export interface Assertions {
  expectedStatus?: number;
  maxLatencyMs?: number;
  requiredHeaders?: Array<{ name: string; value: string }>;
}

export function evaluateAssertions(res: RunResult, a?: Assertions): AssertionResult[] {
  if (!a) return [];
  const out: AssertionResult[] = [];

  if (a.expectedStatus !== undefined) {
    const passed = res.status === a.expectedStatus;
    out.push({
      kind: 'status',
      passed,
      message: passed
        ? `Status ${a.expectedStatus}`
        : `Expected ${a.expectedStatus}, got ${res.status ?? '?'}`,
    });
  }

  if (a.maxLatencyMs !== undefined && res.latencyMs !== undefined) {
    const passed = res.latencyMs <= a.maxLatencyMs;
    out.push({
      kind: 'latency',
      passed,
      message: passed
        ? `≤ ${a.maxLatencyMs}ms (${res.latencyMs}ms)`
        : `Too slow: ${res.latencyMs}ms > ${a.maxLatencyMs}ms`,
    });
  }

  if (a.requiredHeaders?.length) {
    const lookup = Object.fromEntries(
      Object.entries(res.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    for (const h of a.requiredHeaders) {
      const got = lookup[h.name.toLowerCase()];
      const passed = got === h.value;
      out.push({
        kind: 'header',
        passed,
        message: passed
          ? `${h.name}: ${h.value}`
          : got === undefined
            ? `Missing ${h.name}`
            : `${h.name}: expected "${h.value}", got "${got}"`,
      });
    }
  }

  return out;
}
```

Import `Assertions` from `schema/types` in consumers. The evaluator's re-declaration above is just for the file's own isolation; actually do `import type { Assertions } from '../schema/types'` to avoid two sources of truth. Removed inline definition from this file — keep schema as the only source.

### Editor — `apps/web/src/ui/EndpointEditor.tsx`

Add an "Assertions" card in the endpoint editor, positioned below Responses. Collapsible (default closed when `assertions` is undefined, open when any field is set).

```tsx
<section className="card p-3">
  <h3>{t('assertions')}</h3>
  <label> {t('expectedStatus')} <input type="number" value={...} onChange={...} /> </label>
  <label> {t('maxLatencyMs')} <input type="number" value={...} onChange={...} /> </label>
  <div>
    {t('requiredHeaders')}
    {/* name/value rows + add/remove */}
  </div>
</section>
```

Use the existing empty-string→`undefined` idiom for numeric inputs. Clearing all three fields drops the `assertions` key entirely (not `{ ... }` empty object) to keep specs clean in git.

### RunPanel display

In the response summary row, after the existing type-validation chip, render each `AssertionResult`:

```tsx
{assertionResults.map((a, i) => (
  <span
    key={i}
    className={`chip ${a.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
    title={a.message}
  >
    {a.kind === 'status' ? '#' : a.kind === 'latency' ? '⏱' : '📋'}
    {a.passed ? ' ✓' : ' ✗'}
  </span>
))}
```

Compute in `onSend`:

```ts
const assertionResults = evaluateAssertions(res, endpoint!.assertions);
```

Then `setResult({ res, validationErrors, note, assertionResults })`. Extend the `result` state shape.

If any assertion fails, flip the result card's border color to the same "amber" treatment type-errors already uses (pick whichever existing class matches — the visual affordance should match "something's off" parity).

## Testing

### Unit — `apps/web/tests/runner/assertions.test.ts` (new)

- Undefined assertions → empty array.
- `expectedStatus` pass (200==200) and fail (200!=404).
- `maxLatencyMs` pass (100<=200), fail (300>200), missing `res.latencyMs` → skipped.
- Required header name case-insensitive.
- Required header value exact match (fail on case mismatch too — `application/JSON` ≠ `application/json`).
- Missing header → "Missing X" message.
- Empty `requiredHeaders: []` → no header results.
- Multiple failing headers → one result per entry.

### Unit — serialize

- Spec with `endpoint.assertions` round-trips through toJSON/fromJSON.
- Endpoint without assertions has no `"assertions"` key in JSON.

### Component — `EndpointEditor` assertions

New `apps/web/tests/ui/EndpointEditor.assertions.test.tsx`:
- Type `200` in Expected Status → `endpoint.assertions.expectedStatus === 200`.
- Clear all three → `endpoint.assertions === undefined` (assert `'assertions' in endpoint === false`).
- Add a header row, fill name/value → stored.
- Remove a header row → removed from the array; if last row removed → the whole `requiredHeaders` key dropped (or just empty-array is acceptable — pick one, document the choice).

### Component — `RunPanel` shows chips

Extend `RunPanel.*.test.tsx`:
- Mock fetch to return 200 with latency 50ms and a `content-type: application/json` header.
- Endpoint asserts expectedStatus=200, maxLatencyMs=100, requiredHeader content-type=application/json.
- After Send, assert three green chips visible with correct tooltips.
- Change mock to 404 → chip renders red, tooltip mentions the mismatch.

## Error handling

No new error surface. `evaluateAssertions` is pure and total (no throw). A `res.status` of `undefined` (network error) → status assertion reports "got ?".

## Open questions

1. Should failed assertions count as a "send failure" for History (`ok: false`)? Decision: no — ok follows HTTP-ok per existing semantics. Assertion failures show as chips; history records the actual result.
2. Regex support for header values? Deferred. An exact-match MVP covers 80% of real-world checks.
