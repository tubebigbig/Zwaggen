# Response → request chaining — capture a field, save to env var

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — schema + `runner/` + `EndpointEditor` + `RunPanel`

## Problem

Most real APIs require an auth flow: POST to `/login`, capture the returned `token`, use it as a bearer header on every subsequent call. Today in Zwaggen the user runs `/login`, eyeballs the response, copies the token, opens the env editor, pastes it, switches back to another endpoint, sends. Repeat after every token expiry.

Postman solves this with pre/post-request scripts — we explicitly rejected scripting. But a *declarative* capture ("from the response, take `data.token`, save it into env var `authToken`") covers 90% of what those scripts are used for without inviting arbitrary JS into the spec.

## Goal

Per endpoint, optionally declare one or more post-response captures:

```
When this request returns 2xx, take <path> from the body and save it as env var <name> in env <envName>.
```

The runner applies the captures after each successful Send. No scripting surface; a tiny dot-path expression language is enough.

## Non-goals

- **Not JavaScript / pre-request hooks / assertions-as-hooks.** One data shape, one direction: response body → env var.
- **Not conditional chaining** (e.g., "only if status is 201"). Captures run on any 2xx; 4xx/5xx skip capture. If a user wants different behavior per status, they can leave the var unset and let the downstream request fail visibly.
- **Not array-spread / JSONPath filter expressions** (`$.users[?(@.active)]`). A lean dot-path with array-index support (`users[0].token`) covers the realistic cases.
- **Not automatic secret marking.** If the captured value should be a secret, the env variable must already be defined as `secret: true`. The capture respects the existing flag.
- **Not request-header capture.** Body only. Header captures can come later (needed for `Set-Cookie` rotation flows, rare in API testing).
- **Not implicit ordering between endpoints.** Captures mutate env state side-effectfully; subsequent calls in the same or different endpoint see the updated value. Users who want strict ordering use Run all with history in the intended sequence.

## Requirements

1. `Endpoint.captures?: Capture[]` where each `Capture` is:
   ```ts
   { path: string; setVar: string; envName?: string }
   ```
   `path` = dot-path with bracket indices (e.g., `data.token`, `users[0].id`). `setVar` = env variable name. `envName` = target env name; defaults to the active environment if absent.
2. **Path evaluator** `extractByPath(body: unknown, path: string): { value: unknown; found: boolean }` — pure, cycle-safe, no throw. Returns `{ found: false }` when any segment misses or the body is not traversable.
3. **Capture runner** executes AFTER a successful (`res.ok === true`) `sendRequest` call. For each capture:
   - Extract with `extractByPath(res.body, capture.path)`.
   - Stringify the value (numbers/booleans coerced to their string form; objects/arrays → `JSON.stringify`).
   - Look up the target env variable (default env if not named). If it exists, update its `value` in the store (for non-secret) or persist to IndexedDB secret store (for secret).
   - If the env variable is missing entirely, push a warning to the result; do not auto-create.
4. **Editor** — a small Captures card in `EndpointEditor` (placed near Assertions). Rows with path / setVar inputs, add/remove buttons, optional envName dropdown. Clearing all rows drops the `captures` key.
5. **Result UI** — when a Send triggers captures, render a small section below the assertion chips: "Captured: `authToken` ← `data.token` = `'eyJ...'`" (truncated if long). On skipped captures (missing env var, path not found): show a warning chip with the reason.
6. **No capture on non-2xx.** If `res.ok === false`, captures are skipped entirely (no "partial capture" semantics).
7. **Persistence:** captured values that target a non-secret env var update `spec.environments[env].variables[i].value` via `setSpec`. Secret targets update IDB only (matching the save/strip flow). Spec file remains the source of truth for non-secret values.

## Design

### Schema — `apps/web/src/schema/types.ts`

```ts
export interface Capture {
  path: string;
  setVar: string;
  envName?: string;
}

export interface Endpoint {
  // …existing
  captures?: Capture[];
}
```

No schema bump.

### Path evaluator — `apps/web/src/runner/path.ts` (new)

Parses `data.users[0].token` into segments `['data', 'users', 0, 'token']`, then walks:

```ts
export function extractByPath(body: unknown, path: string): { value: unknown; found: boolean } {
  const segments = parsePath(path);
  if (segments === null) return { value: undefined, found: false };

  let cur: unknown = body;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return { value: undefined, found: false };
    if (typeof seg === 'number') {
      if (!Array.isArray(cur)) return { value: undefined, found: false };
      if (seg < 0 || seg >= cur.length) return { value: undefined, found: false };
      cur = cur[seg];
      continue;
    }
    if (typeof cur !== 'object' || Array.isArray(cur)) return { value: undefined, found: false };
    if (!(seg in (cur as Record<string, unknown>))) return { value: undefined, found: false };
    cur = (cur as Record<string, unknown>)[seg];
  }
  return { value: cur, found: true };
}

function parsePath(p: string): Array<string | number> | null {
  // Split on `.` and `[N]`. Examples:
  //   "data.token"        → ["data", "token"]
  //   "users[0].id"       → ["users", 0, "id"]
  //   "[2].name"          → [2, "name"]
  //   ""                  → null
  // ...implementation...
}
```

Pure total function. On malformed path (empty string, unterminated `[`, non-numeric index), returns `{ found: false }` without throwing.

### Capture runner — `apps/web/src/runner/captures.ts` (new)

```ts
import type { Spec, Capture } from '../schema/types';
import { extractByPath } from './path';

export interface CaptureResult {
  capture: Capture;
  found: boolean;
  value?: string;
  warning?: string; // e.g. "no such env var", "path not found", "target env missing"
}

export function applyCaptures(
  spec: Spec,
  captures: Capture[] | undefined,
  body: unknown,
): { results: CaptureResult[]; specPatch: Spec | null; secretsPatch: Record<string, string> | null };
```

- `specPatch` is a new `Spec` with updated non-secret values (or `null` if no non-secret captures hit).
- `secretsPatch` is a merge-in record for the active env's secret store (or `null` if no secret captures hit).
- Caller (`RunPanel`) applies via `setSpec(specPatch)` and `saveSecrets({...existing, [env]: {...existing[env], ...secretsPatch}})`.

Stringification:

```ts
function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
```

### Editor — `apps/web/src/ui/EndpointEditor.tsx`

Captures card, styled like the Assertions card:

```tsx
<section>
  <h3>{t('captures')}</h3>
  <p className="text-xs text-slate-500">{t('capturesHint')}</p>
  {captures.map((c, i) => (
    <div key={i} className="flex gap-1">
      <input aria-label={`capture-path-${i}`} placeholder="data.token" value={c.path} onChange={...} />
      <span>→</span>
      <input aria-label={`capture-var-${i}`} placeholder="authToken" value={c.setVar} onChange={...} />
      <select aria-label={`capture-env-${i}`}>
        <option value="">{t('activeEnv')}</option>
        {envNames.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button onClick={() => removeCapture(i)} aria-label={`remove-capture-${i}`}>×</button>
    </div>
  ))}
  <button onClick={addCapture}>{t('addCapture')}</button>
</section>
```

Helper `patchCaptures` mirrors `patchAssertions`: merge, check empty, drop key when fully cleared.

### Result UI — `apps/web/src/ui/RunPanel.tsx`

In `RunResultView`, after the existing chip row, render:

```tsx
{captureResults.length > 0 && (
  <div className="mt-2 text-xs text-slate-600">
    {captureResults.map((c, i) => (
      <div key={i} className="flex items-center gap-1">
        {c.found ? (
          <span className="text-emerald-700">
            {c.capture.setVar} ← {c.capture.path} = <code>{truncate(c.value!, 40)}</code>
          </span>
        ) : (
          <span className="text-amber-700">
            {c.capture.setVar}: {c.warning ?? 'path not found'}
          </span>
        )}
      </div>
    ))}
  </div>
)}
```

In `onSend`, after the existing `setResult(...)`:

```ts
if (res.ok) {
  const { results, specPatch, secretsPatch } = applyCaptures(spec, endpoint!.captures, res.body);
  if (specPatch) await setSpec(specPatch);
  if (secretsPatch) {
    const existing = await loadSecrets();
    await saveSecrets({ ...existing, [spec.activeEnvironment]: { ...existing[spec.activeEnvironment], ...secretsPatch } });
  }
  setResult((prev) => prev ? { ...prev, captureResults: results } : prev);
}
```

Extend the result state shape with `captureResults: CaptureResult[]`.

## Testing

### Unit — `apps/web/tests/runner/path.test.ts` (new)

Required cases:
- `extractByPath({a: 1}, 'a')` → `{ value: 1, found: true }`.
- `extractByPath({a: {b: 'x'}}, 'a.b')` → value `'x'`.
- `extractByPath({users: [{id: 1}, {id: 2}]}, 'users[1].id')` → value `2`.
- `extractByPath([1, 2, 3], '[2]')` → value `3`.
- `extractByPath({}, 'missing')` → `{ found: false }`.
- `extractByPath(null, 'a')` → `{ found: false }`.
- Malformed path `"[not-num]"` → `{ found: false }`.
- Empty path `""` → `{ found: false }`.
- Null leaf value (`{a: null}` path `a`) → `{ value: null, found: true }`.
- Path resolves to `undefined` inside the object (e.g., `{a: undefined}` path `a`) → documented behavior: `found: false` (since we use `in` operator, but `undefined` values are `in`). Pick one semantic and assert.

### Unit — `apps/web/tests/runner/captures.test.ts` (new)

- No captures → empty results, no patches.
- Capture hits a non-secret var: returns a `specPatch` with the env var's `value` updated. No `secretsPatch`.
- Capture hits a secret var: returns `secretsPatch` with the value; `specPatch` is null.
- Capture targets a missing env var: result has `warning: "no such env var"`.
- Capture targets a named `envName` that doesn't exist: result warning mentions missing env.
- Path not found in body → result `found: false`, `warning: "path not found"`.
- Stringify: number 42 → `"42"`, boolean true → `"true"`, object → JSON.

### Unit — serialize

Round-trip tests: `endpoint.captures` persists; absent when undefined; empty array never serialized (drops to undefined on clear).

### Component — `EndpointEditor` captures card

- Add a row, fill path + setVar → stored on endpoint.
- Remove a row → array shrinks.
- Remove last row → `captures` key dropped.

### Component — `RunPanel` applies captures

- Mock fetch to return `{ token: 'abc' }`. Endpoint has capture `{ path: 'token', setVar: 'authToken' }`, env has `authToken` variable (non-secret). Click Send.
- Assert `useSpecStore.getState().spec.environments[default].variables[i].value === 'abc'`.
- Assert the capture result row is rendered in the UI.
- If capture points to a secret var: assert IDB `zwaggen:secrets` has the new value and spec still has empty value (stripped style).

## Error handling

- Malformed path produces a `found: false` warning — runner never throws.
- Unknown env / env var produces a warning result, no spec mutation.
- Non-2xx response skips capture entirely.

## Open questions

1. Should we support header capture (e.g., `Set-Cookie`, `X-Request-Id`)? **Decision**: body only in MVP; header capture is a follow-up once we see demand.
2. Array-spread or filter expressions? **Decision**: deferred. Add if users report insufficiency.
