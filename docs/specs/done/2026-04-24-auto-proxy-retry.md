# Spec — Auto-suggest "Use proxy" retry on first cross-origin failure

## Problem

A user fires a request, gets a CORS error, and sees the response panel render `cors-or-network` with a generic hint. The fix is one toggle (`Use proxy`) but the user doesn't know that — and even if they do, they have to flip the toggle, click Send again, and watch the same request go through.

We added the bundled proxy in v0.2.0 specifically so this case Just Works once the toggle is flipped. The remaining friction: the user has to KNOW to flip it. This slice closes that gap by surfacing a one-click **Retry through proxy** button right in the error panel when the failure pattern matches "CORS-blocked request, proxy was off, proxy URL is configured."

## Success criteria

- When `RunResult.error.kind === 'cors-or-network'` AND the request was sent with `useProxy: false` (effective), the error panel renders an additional **Retry through proxy** button.
- Clicking the button re-runs the **same request** with `useProxy: true` as a one-shot override (does NOT mutate the spec's `useProxyDefault` or the endpoint's `useProxy` field).
- If the retry succeeds → the response panel shows the successful response (replaces the error).
- If the retry also fails (e.g., proxy isn't running) → the new error is `cors-or-network` with the existing "Proxy unreachable" hint. We do NOT show another retry button (the proxy IS being used; offering another retry through it would be silly).
- The button is omitted when:
  - `useProxy` was already true (offering "retry through proxy" when it's already on is nonsense).
  - The error is not `cors-or-network` (e.g. `timeout`, `other`).
  - We're rendering on `play.zwaggen.com` (the hosted page has no bundled proxy and no clear escape hatch — surfacing the button would just lead to another failed retry).
- The button is visually subordinate to the error message — it's a small inline action, not a giant CTA. Same row as the error's hint or just below it.
- i18n strings in en + zh-TW.
- Tests:
  - Unit: a `cors-or-network` result with `useProxy: false` (and not in playground mode) renders the retry button.
  - Unit: clicking the button calls the runner with `useProxy: true`.
  - Unit: a `cors-or-network` result with `useProxy: true` does NOT render the button.
  - Unit: a `timeout` or `other` error does NOT render the button.
  - Unit: in playground mode the button does NOT render.
- TODO entry added (and ticked).

## Out of scope

- **Auto-flipping the toggle for the next request.** The retry is one-shot. If the user wants every future request through the proxy, they flip the toggle themselves (or set `useProxyDefault: true` in the spec). Auto-flipping would surprise users who flipped it off intentionally.
- **Detecting whether the configured proxy URL is actually reachable** before showing the button. The button's failure path already shows a clear "proxy unreachable" hint.
- **Retrying with proxy automatically without user click.** Auto-retry on every CORS failure would make duplicate network calls — annoying and slow. User explicitly clicks.
- **A "remember my choice" affordance** ("always retry through proxy"). Same reason as above — explicit user action wins.
- **Surfacing the button outside the Run panel** (e.g. in BatchRunPanel). Batch runs are already tagged with their resolved `useProxyUsed`; per-row retry is a separate feature.
- **Updating the on-disk history entry** for the failed first attempt. We treat it as a normal failed run; the retry creates a new history entry on success. (Today's history flow is already this way.)

## Approach

### `RunResultView` gains a retry callback prop

Today `RunResultView` is purely presentational. To trigger a retry it needs to call back into the parent's run logic. Add an optional `onRetryWithProxy?: () => void` prop. If present AND the failure pattern matches, render the button.

### Eligibility check

Inside `RunResultView`:

```ts
const proxyWasOff = !result.proxyOn;  // (existing field on result; see below)
const eligibleForProxyRetry =
  res.error?.kind === 'cors-or-network' &&
  proxyWasOff &&
  !IS_PLAYGROUND &&
  typeof onRetryWithProxy === 'function';
```

The `result.proxyOn` field already exists on the result shape (`built.useProxy` carried through). We don't need a new field.

### Wiring in RunPanel

`RunPanel` already extracts the actual run logic into the body of an event handler. Refactor the `runOnce` body into a function `runOnce(opts?: { overrideUseProxy?: boolean })`:

```ts
async function runOnce(opts?: { overrideUseProxy?: boolean }): Promise<void> {
  // ... existing body ...
  const effectiveUseProxy = opts?.overrideUseProxy ?? useProxy;
  // ... use effectiveUseProxy in the sendRequest call + history pushes ...
}
```

Pass `onRetryWithProxy={() => runOnce({ overrideUseProxy: true })}` to `RunResultView`. The retry call sets `useProxy: true` for that one request only — `useProxyState` (the persistent toggle UI) is unchanged.

### Button UI

Inline next to the error hint:

```tsx
<div className="text-sm">{res.error.hint}</div>
{eligibleForProxyRetry && (
  <button
    type="button"
    className="mt-2 text-xs font-semibold text-red-700 underline-offset-2 hover:underline"
    onClick={onRetryWithProxy}
  >
    {t('retryThroughProxy')}
  </button>
)}
```

(Real markup matches existing styling tokens. Underlined link-style is subordinate to the headline error.)

### i18n strings

en:
```json
"retryThroughProxy": "Retry through proxy"
```

zh-TW:
```json
"retryThroughProxy": "改用 proxy 重試"
```

### Tests

Co-locate with existing RunPanel tests:

```tsx
test('cors-or-network error with useProxy:false renders the retry button', () => { ... });
test('clicking Retry through proxy fires runOnce with overrideUseProxy:true', async () => { ... });
test('cors-or-network error with useProxy:true does NOT render the retry button', () => { ... });
test('timeout error does NOT render the retry button', () => { ... });
test('playground mode: retry button is hidden', () => { ... });
```

Use the existing RunPanel test patterns (mock `sendRequest`, render, simulate user actions).

### Risks

- **Refactoring `runOnce`** is the trickiest part. The function has many implicit captures (state setters, refs to current spec/endpoint). Keep the refactor minimal — extract the body into a named function inside the component, accept opts, do the existing logic with `effectiveUseProxy` substituted.
- **Eligibility check might surprise users on `play.zwaggen.com`** if they expected the same flow as local. The button is hidden there; the existing demo banner already messages "this is a CORS-limited demo." Acceptable.
- **`proxyOn` truthiness**: today the result shape carries `proxyOn` from `built.useProxy` (boolean). Verify the field is set correctly across the existing flow; if it's missing for some path, default to false.
- **`/play.zwaggen.com` detection**: the existing code uses `IS_PLAYGROUND`. Verify it's `true` only on the hosted page (typically by URL host check). Reuse without re-deriving.

## Done definition

- `RunResultView` renders a **Retry through proxy** button when the failure pattern matches.
- `RunPanel.runOnce` accepts an `overrideUseProxy` opt; the retry button passes `true`.
- Eligibility honored: hidden when proxy was already on, when error is non-CORS, or in playground mode.
- i18n strings in both locales.
- 5 unit tests cover the matrix.
- TODO ticked.
- Spec + plan moved to `done/`.
- Plus three NEW open TODO entries the user requested:
  - Single-endpoint export (cURL / TS client method / OpenAPI snippet)
  - Single-type export (TS interface / Zod / JSON Schema)
  - Folder export (everything in a folder, same formats)
  - Live codegen preview panel in the web app
- Branch `plan/auto-proxy-retry` pushed.
