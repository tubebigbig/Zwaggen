# Run history — per-endpoint run log in IndexedDB

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — `storage/drafts.ts` (new key), `RunPanel`, `store`

## Problem

Every click of Send discards the previous run. The user can't say "what did I send yesterday?" or "what was the response body last time?" without re-running (which costs a real API call) or rewatching the DevTools network tab. For flaky endpoints, teams rerun the same request dozens of times; losing that record makes debugging hopeless.

Other tools (Postman, Insomnia) treat the run log as a first-class citizen. Zwaggen's local-file storage makes this easier, not harder — the browser already carries an IndexedDB draft cache; adding a history bucket alongside it costs almost nothing.

## Goal

Keep the last **N = 20** runs per endpoint in IndexedDB. Expose them in a small History drawer in the Run panel. Each entry shows timestamp, status, latency, and pass/fail/validation-error count. Click to view the stored response body inline; click **Replay** to reseed the form inputs from that run's inputs.

## Non-goals

- **Not cross-machine sync.** History is local to the browser profile. Clearing site data wipes it (same as the draft cache).
- **Not part of the canonical spec file.** History never writes into `.zwaggen.json` — keeps git diffs clean and avoids leaking response payloads.
- **Not diff between runs.** Seeing two runs side-by-side is a nice follow-up, not an MVP.
- **Not export.** Users can't download their history as JSON yet.
- **Not global run log.** Bucketed per-endpoint; a unified timeline is a separate feature.
- **Not saved requests** ("snippets" or named presets). History entries are auto-created on every Send.

## Requirements

1. **Storage**: a new IndexedDB key `zwaggen:history` holds `Record<endpointId, HistoryEntry[]>`. Each array is newest-first and capped at 20 entries; older entries are dropped on push.
2. **Entry shape** (see "Design" for exact TS):
   - `id: string` (uuid)
   - `at: number` (epoch ms)
   - `inputs: RunInputs` (path / query / header / body *pre-substitution*)
   - `baseUrlUsed: string` (what the Run panel had in the field — pre-substitution)
   - `useProxyUsed: boolean`
   - `result`: trimmed copy of `RunResult` — status, statusText, headers, latencyMs, rawText *truncated* to 100 KB, plus any validation-error list.
3. **Secrets**: resolved secret values are **not** stored. Only the `inputs` (with `{{VAR}}` still as literal tokens) and the response. The response body may contain secrets returned by the server — that's unavoidable for the feature to be useful, but we document it and give the user a one-click "Clear history" for each endpoint.
4. **Auto-write**: every `Send` push a new entry after the response returns (or after a classified error — errors are also history-worthy). No UI affordance needed to opt in.
5. **View**: a History button next to Send opens a compact drawer/dropdown listing entries. Each row shows `<time>`, `<status chip>`, `<latencyMs>ms`, and a validation indicator (✓ / ✗ N / — for "no type declared"). Click a row to expand the stored response inline below the current live response.
6. **Replay**: a Replay button on each row reseeds `pathVals` / `queryVals` / `headerVals` / `bodyText` / `baseUrl` / `useProxy` from that entry. It does *not* auto-send — the user can inspect, edit, then Send.
7. **Clear**: a "Clear history for this endpoint" action in the drawer. No global clear (too easy to trigger by accident).
8. **Endpoint delete cleanup**: when an endpoint is removed from the spec, its history bucket is deleted from IndexedDB. (Orphan cleanup also happens on spec open — see edge cases.)
9. **Max-age eviction**: optional in MVP — N = 20 cap is enough; time-based eviction can come later.

## Design

### Storage layer — `apps/web/src/storage/history.ts` (new)

```ts
import { del, get, set } from 'idb-keyval';
import type { RunInputs, RunResult } from '../runner/send';

const HISTORY_KEY = 'zwaggen:history';
const MAX_PER_ENDPOINT = 20;
const MAX_BODY_BYTES = 100 * 1024;

export interface HistoryEntry {
  id: string;
  at: number;
  endpointId: string;
  inputs: RunInputs;
  baseUrlUsed: string;
  useProxyUsed: boolean;
  result: TrimmedResult;
}

export interface TrimmedResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  latencyMs?: number;
  rawText?: string;       // trimmed to MAX_BODY_BYTES
  rawTruncated?: boolean; // true when we trimmed
  validationErrors?: Array<{ path: string; message: string }>;
  errorKind?: string;
  errorHint?: string;
}

type Store = Record<string, HistoryEntry[]>;

export async function loadHistory(endpointId: string): Promise<HistoryEntry[]> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  return store[endpointId] ?? [];
}

export async function pushHistory(entry: HistoryEntry): Promise<void> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  const bucket = [entry, ...(store[entry.endpointId] ?? [])].slice(0, MAX_PER_ENDPOINT);
  store[entry.endpointId] = bucket;
  await set(HISTORY_KEY, store);
}

export async function clearEndpointHistory(endpointId: string): Promise<void> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  delete store[endpointId];
  await set(HISTORY_KEY, store);
}

export async function reconcileHistory(validEndpointIds: Set<string>): Promise<void> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  let mutated = false;
  for (const id of Object.keys(store)) {
    if (!validEndpointIds.has(id)) { delete store[id]; mutated = true; }
  }
  if (mutated) await set(HISTORY_KEY, store);
}

export function trimResult(r: RunResult, validationErrors: Array<{ path: string; message: string }>): TrimmedResult {
  const rawTruncated = !!(r.rawText && r.rawText.length > MAX_BODY_BYTES);
  return {
    ok: r.ok,
    status: r.status,
    statusText: r.statusText,
    headers: r.headers,
    latencyMs: r.latencyMs,
    rawText: rawTruncated ? r.rawText!.slice(0, MAX_BODY_BYTES) : r.rawText,
    rawTruncated,
    validationErrors,
    errorKind: r.error?.kind,
    errorHint: r.error?.hint,
  };
}
```

Key choices:
- Trim the **raw text**, not the parsed `body`. Re-parsing the trimmed text may fail, which is fine — the drawer renders raw text, not parsed JSON, when `rawTruncated` is true.
- `validationErrors` is passed in from the UI (it's not part of `RunResult`), so storage doesn't need to know how to re-run the validator.

### Store integration — `apps/web/src/state/store.ts`

Extend `selectEndpoint` is unchanged. Instead, wire two behaviours into the endpoint-delete flow. Currently the UI deletes endpoints via `setSpec({...spec, endpoints: filtered})`. That's imperative and untyped; wrap a helper in the store:

```ts
async deleteEndpoint(id: string) {
  const next = { ...get().spec, endpoints: get().spec.endpoints.filter((e) => e.id !== id) };
  await get().setSpec(next);
  if (get().selectedEndpointId === id) set({ selectedEndpointId: null });
  await clearEndpointHistory(id);
}
```

Also extend the `replaceSpec` / `newSpec` / `discardDraft` paths with a `reconcileHistory(new Set(newSpec.endpoints.map(e => e.id)))` call so switching specs doesn't leave orphan entries.

### RunPanel integration — `apps/web/src/ui/RunPanel.tsx`

1. **On Send success (or error)**: push a `HistoryEntry`. Do it inside `onSend` right after `setResult(...)`:

```ts
await pushHistory({
  id: crypto.randomUUID(),
  at: Date.now(),
  endpointId: endpoint!.id,
  inputs: { path: pathVals, query: queryVals, headers: headerVals, body },
  baseUrlUsed: baseUrl,
  useProxyUsed: (useProxy ?? (endpoint!.useProxy === 'inherit' ? spec.useProxyDefault : endpoint!.useProxy)) === true,
  result: trimResult(res, validationErrors),
});
```

2. **History drawer**: a new `<HistoryDrawer endpointId={endpoint.id} onReplay={...} />` component rendered next to the result panel.
   - Loads entries on mount via `loadHistory(endpointId)`.
   - Re-loads after each Send (via an `epoch` counter passed as prop that bumps on every send).
   - Each row: `<time datetime=...>{relativeTime(at)}</time>` + status chip + latency + validation indicator + Replay button.
   - Clicking the row toggles an expanded `<ResponseView body={parsedOrRawText} errors={entry.result.validationErrors ?? []} />` below.
   - Footer: "Clear history for this endpoint" button. Confirm via `window.confirm`.

3. **Replay handler**:

```ts
function replay(e: HistoryEntry) {
  setPathVals(e.inputs.path);
  setQueryVals(e.inputs.query);
  setHeaderVals(e.inputs.headers);
  setBodyText(e.inputs.body !== undefined ? JSON.stringify(e.inputs.body, null, 2) : '{}');
  setBaseUrl(e.baseUrlUsed);
  setUseProxy(e.useProxyUsed);
}
```

Note: storing `inputs.body` as the already-parsed object means replay needs to stringify for the textarea. That's already what the UI expects.

### UI sketch

```
┌──────────────────────────────────────────────────┐
│ Try it               [Send] [Copy as cURL] [History ▼] │
│ Base URL: [...]  [ ] Use proxy                   │
│ Path params: …    Query: …   Headers: …          │
│ Body: …                                          │
└──────────────────────────────────────────────────┘

Live response
┌──────────────────────────────────────────────────┐
│ 200 OK   45ms   ✓ type ok                        │
│ { "name": "Alice", … }                           │
└──────────────────────────────────────────────────┘

History (drawer)
┌──────────────────────────────────────────────────┐
│ 10:42:18   200   45ms   ✓          [Replay]      │
│ 10:40:02   500   12ms   — no type  [Replay]      │
│ 10:38:55   200   60ms   ✗ 2 errs   [Replay] ▾    │
│   { "name": 123, … }  (validation: name…)        │
│ Clear history                                    │
└──────────────────────────────────────────────────┘
```

## Architecture & data flow

```
                        ┌───────────────┐
              Send ──►  │  sendRequest  │
                        └──────┬────────┘
                               │
                   RunResult, validationErrors
                               │
                               ▼
                       pushHistory(entry)
                               │
                               ▼
              zwaggen:history (idb-keyval, bucketed by endpointId)
                               │
                               ▼
                     HistoryDrawer (loadHistory on mount; re-load on epoch)
                               │
                               ├─ view → inline expand of stored response
                               └─ Replay → reseed RunPanel form state
```

## Testing

### Unit — `apps/web/tests/storage/history.test.ts` (new)

Use `idb-keyval`'s in-memory test mode (or fall back to a mock — look at how `drafts.test.ts` is set up if one exists; otherwise use a `global.indexedDB` polyfill in `tests/setup.ts`).

Required cases:
- `pushHistory` appends and keeps newest-first order.
- `pushHistory` caps at 20 per endpoint; 21st push drops the oldest.
- `pushHistory` for different endpoint IDs keeps separate buckets.
- `loadHistory` returns `[]` for an unknown endpoint.
- `clearEndpointHistory` removes only that endpoint's entries.
- `reconcileHistory` drops buckets for endpoint IDs not in the valid set; keeps valid ones.
- `trimResult` with a body > 100 KB sets `rawTruncated: true` and trims `rawText` to exactly 100 KB.
- `trimResult` with small body leaves `rawTruncated` undefined/false and keeps the text intact.

### Component — `apps/web/tests/ui/RunPanel.history.test.tsx` (new)

- After a simulated Send, a history entry appears in the drawer.
- Drawer shows the most recent entry on top.
- Replay button reseeds the form inputs (assert `bodyText` textarea and query/header inputs reflect the old entry).
- Clear-history confirm (stub `window.confirm → true`) empties the drawer.
- Truncated body: seed history with a `rawTruncated: true` entry; drawer expansion shows a "truncated" marker above the body.

### Store — `apps/web/tests/state/store.history.test.ts` (new)

- `deleteEndpoint(id)` removes the endpoint AND clears its history bucket.
- `replaceSpec(specMissingEndpointX, handle)` reconciles: endpoint X's history bucket is dropped.

## Error handling

- **IndexedDB write failure**: swallow and log to console. Don't surface to user — they just sent the request successfully; failing to persist the record is not worth an interruption.
- **Corrupt entry on load**: if a stored entry lacks required fields (e.g., older format), drop it silently. The cap will refresh within 20 sends.
- **Endpoint deleted while drawer is open**: the drawer lives inside RunPanel, which unmounts when `selectedEndpointId` becomes null. No special handling needed.

## Edge cases

- **User opens a spec whose endpoints have IDs colliding with history IDs from a previous spec**: `reconcileHistory` on spec load drops history for IDs not in the new spec. Stale buckets with the same ID as a new endpoint *would* be inherited — this is a rare collision (endpoint IDs are uuids) and the cost of guarding against it is high (would need spec-level id namespacing). Accepted.
- **Browser storage full**: `set()` throws. We catch and log; old entries aren't pruned more aggressively than the 20-cap. A follow-up could implement LRU eviction across endpoints when write fails.
- **Proxy toggled mid-session**: replay stores the `useProxyUsed` at send time, which is the right value to reproduce the original run. Replay sets it back; user can flip it if they want different behavior.

## Open questions

1. Should we store the *parsed* `body` alongside `rawText`? **Decision**: no — we parse on-demand in the drawer from `rawText`. Saves storage and keeps the data shape flat.
2. Should the replay button also auto-send? **Decision**: no — surprising behavior. Users want to inspect before re-firing.
3. Should history persist across spec opens on the same machine, even for different spec files? **Decision**: yes — IDB is per-origin, and `reconcileHistory` prevents stale orphans. A file-scoped history would require a spec fingerprint and a larger blast radius.
