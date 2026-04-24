# Auto-suggest "Use proxy" retry on first cross-origin failure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a one-click **Retry through proxy** button in the RunPanel error view when a request fails with `cors-or-network` AND was sent without the proxy. Clicking re-runs that request with `useProxy: true` as a one-shot override (does NOT mutate the spec).

**Architecture:** Refactor `RunPanel`'s run logic into a named `runOnce({ overrideUseProxy? })` function. `RunResultView` accepts an `onRetryWithProxy` callback prop and renders the button when eligibility checks pass.

**Tech Stack:** React, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-24-auto-proxy-retry.md`. Constraints:

- One-shot override — does NOT flip the persistent toggle.
- Hidden when `useProxy` was already true, when error is non-CORS, or in playground mode.
- The retry's failure path doesn't show another retry button.

---

### Task 1: Refactor `RunPanel.runOnce` to accept `overrideUseProxy`

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx`

- [ ] **Step 1: Find the existing run handler**

It's the `async function` (likely inline) that builds `inputs.body`, calls `sendRequest`, sets `result`, pushes history, etc.

- [ ] **Step 2: Extract into a named function**

```ts
async function runOnce(opts?: { overrideUseProxy?: boolean }): Promise<void> {
  const effectiveUseProxy = opts?.overrideUseProxy ?? useProxy;
  // ... existing body, but every reference to `useProxy` becomes `effectiveUseProxy` ...
}
```

Audit every `useProxy` reference inside the body and switch to `effectiveUseProxy`:
- `sendRequest({ ..., useProxy: effectiveUseProxy, ... })`
- `useProxyUsed` history field
- Any computed values that derived from `useProxy`

The component-level `useProxyState` / `setUseProxy` (the persistent toggle UI) is UNTOUCHED.

- [ ] **Step 3: Wire the existing button**

The existing **Send** button calls `runOnce()` with no args (uses the toggle's current state).

- [ ] **Step 4: Verify tests still pass**

```bash
pnpm --filter web test
pnpm --filter web lint
```

Expected: green; no behavior change yet.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/RunPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(web): extract RunPanel run handler to runOnce({overrideUseProxy?})

Pure refactor — the Send button still calls runOnce() with no args
and the toggle drives effective behavior. Sets up the next commit
which adds a one-shot proxy retry path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add the retry-through-proxy button + i18n

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx` — `RunResultView` accepts `onRetryWithProxy`, renders button conditionally; `RunPanel` passes the callback.
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — add `retryThroughProxy` key.

- [ ] **Step 1: i18n strings**

en:
```json
"retryThroughProxy": "Retry through proxy"
```

zh-TW:
```json
"retryThroughProxy": "改用 proxy 重試"
```

- [ ] **Step 2: Update `RunResultView`**

Add `onRetryWithProxy?: () => void` to its props. Inside, when rendering an error:

```tsx
const proxyWasOff = !result.proxyOn;
const eligibleForProxyRetry =
  res.error?.kind === 'cors-or-network' &&
  proxyWasOff &&
  !IS_PLAYGROUND &&
  typeof onRetryWithProxy === 'function';
```

After the existing error block, render:

```tsx
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

(Adapt placement to the existing markup — inline next to the hint, or just below it.)

- [ ] **Step 3: Wire from `RunPanel`**

Where `<RunResultView result={result} />` is rendered, add:

```tsx
<RunResultView result={result} onRetryWithProxy={() => runOnce({ overrideUseProxy: true })} />
```

- [ ] **Step 4: Tests**

Add to `apps/web/tests/ui/RunPanel.test.tsx` (or a new file):

```tsx
test('cors-or-network error with useProxy:false renders Retry through proxy', () => {
  // mock sendRequest to return { error: { kind: 'cors-or-network', hint: '...' } }
  // render RunPanel
  // toggle useProxy off (default)
  // click Send
  // assert the button text "Retry through proxy" appears
});

test('clicking Retry through proxy re-fires the request with useProxy:true', async () => {
  // mock sendRequest twice — first fails CORS, second succeeds
  // render + Send → see error + retry button
  // click retry → assert sendRequest was called with useProxy:true
  // assert response panel shows the success
});

test('cors-or-network error with useProxy:true does NOT render the retry button', () => {
  // toggle useProxy on, mock failed proxy attempt
  // render + Send
  // assert NO retry button
});

test('timeout error does NOT render the retry button', () => {
  // mock sendRequest returning kind: 'timeout'
  // render + Send
  // assert NO retry button
});

test('IS_PLAYGROUND mode: retry button hidden', () => {
  // stub the IS_PLAYGROUND import (or whatever determines it)
  // render + Send → CORS error
  // assert NO retry button
});
```

If `IS_PLAYGROUND` is computed inline in RunPanel.tsx (e.g. `const IS_PLAYGROUND = window.location.host.includes('play.zwaggen.com')`), the test mocks `window.location.host` instead of importing.

- [ ] **Step 5: Run tests + lint**

```bash
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/RunPanel.tsx apps/web/src/i18n apps/web/tests/ui
git commit -m "$(cat <<'EOF'
feat(web): one-click "Retry through proxy" on cross-origin failures

When a request fails with cors-or-network AND useProxy was off, the
error panel now renders a small "Retry through proxy" link. Clicking
re-runs the same request with useProxy:true as a one-shot override —
the persistent toggle stays as the user left it.

Hidden when useProxy was already on (would just retry through the
same path), when the error isn't CORS-shaped, and on play.zwaggen.com
(no bundled proxy on the hosted page; the demo banner already
messages this).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Tick TODO + log new follow-ups + move spec/plan

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Tick the auto-retry TODO**

Find the existing entry from web-bundled-proxy:

```
- [ ] Auto-enable "Use proxy" on first cross-origin failure — when the runner gets a TypeError on a cross-origin request and a proxy URL is configured (bundled or otherwise), surface a one-click "Retry through proxy" suggestion. Avoids the user having to know about the toggle in the first place. Surfaced from web-bundled-proxy.
```

Replace with:

```
- [x] Auto-suggest "Use proxy" retry on first cross-origin failure — RunPanel now shows a one-click "Retry through proxy" button when a request fails with cors-or-network AND useProxy was off. One-shot override; persistent toggle unchanged. Hidden in playground mode. See `docs/plans/done/2026-04-24-auto-proxy-retry.md`.
```

- [ ] **Step 2: Add the new TODO entries the user requested**

Add (placed in the Feature section, after existing entries):

```
- [ ] Per-endpoint export — a small "Export this endpoint" button in EndpointEditor that emits a cURL one-liner / generated TS client method / mini-OpenAPI snippet. Useful for sharing one endpoint without dumping the whole spec.
- [ ] Per-type export — same button on TypeBuilder/TypePanel: emit a TS interface / Zod schema / JSON Schema fragment for one type.
- [ ] Folder export — export everything (types + endpoints) under a folder. Same formats as per-endpoint / per-type. Useful for "here's the auth subsystem of our API."
- [ ] Live codegen preview in the web app — a panel that shows the live `zwag generate ts` / `zwag generate zod` output for the current spec, so users can iterate on the spec and see codegen update without running the CLI in a terminal.
```

Update "Last updated" stamp to `2026-04-24 (auto-proxy-retry)`.

- [ ] **Step 3: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-24-auto-proxy-retry.md docs/specs/done/
git mv docs/plans/active/2026-04-24-auto-proxy-retry.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship auto-proxy-retry — tick TODO + log per-endpoint/type/folder export + live codegen preview

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 3 tasks ticked.
- `RunPanel.runOnce` accepts `overrideUseProxy`; Send button still works.
- Retry button renders only on the eligible failure pattern.
- Persistent `useProxyState` toggle untouched by retries.
- 5 unit tests cover the eligibility matrix.
- 4 new TODO entries logged (per-endpoint export, per-type export, folder export, live codegen preview).
- All tests green.
- Branch `plan/auto-proxy-retry` ready to push.
