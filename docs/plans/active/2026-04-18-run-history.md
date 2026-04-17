# Run history — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the last 20 runs per endpoint in IndexedDB, surface them in a History drawer inside `RunPanel`, and offer Replay + Clear per entry. Orphan cleanup when endpoints are deleted or a new spec is opened.

**Spec:** `docs/specs/active/2026-04-18-run-history.md`

**Architecture:** New `storage/history.ts` manages a `zwaggen:history` IDB key shaped as `Record<endpointId, HistoryEntry[]>`. `RunPanel` writes one entry after each Send; a new `HistoryDrawer` component reads the bucket and renders it. Store-level `deleteEndpoint` and a post-`replaceSpec` reconciliation call drop orphan buckets. No changes to `sendRequest`.

**Tech Stack:** existing only — `idb-keyval` already in use. No new deps.

---

## Rules Applied
No new rules. Canonical spec file is unaffected (history never writes to `.zwaggen.json`), so `spec-versioning.md` stays untouched.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/storage/history.ts` | IDB bucket, `loadHistory`, `pushHistory`, `clearEndpointHistory`, `reconcileHistory`, `trimResult` |
| Modify | `apps/web/src/state/store.ts` | `deleteEndpoint` action + reconcile calls on `replaceSpec` / `newSpec` / `discardDraft` |
| Modify | `apps/web/src/ui/EndpointEditor.tsx` | Wire the existing delete button through the new store action |
| Create | `apps/web/src/ui/HistoryDrawer.tsx` | Drawer UI: list, expand, replay, clear |
| Modify | `apps/web/src/ui/RunPanel.tsx` | Push history after Send; mount drawer; expose state setters to replay |
| Modify | `apps/web/src/i18n/locales/en.json` and `zh-TW.json` | `history`, `replay`, `clearHistory`, `noHistory`, `truncated` |
| Create | `apps/web/tests/storage/history.test.ts` | Storage unit tests |
| Create | `apps/web/tests/state/store.history.test.ts` | Store-level orphan cleanup tests |
| Create | `apps/web/tests/ui/RunPanel.history.test.tsx` | Drawer + replay + clear component tests |

---

## Tasks

### Task 1: Storage layer

**Files:**
- Create: `apps/web/src/storage/history.ts`
- Create: `apps/web/tests/storage/history.test.ts`

**Acceptance criteria covered:** spec requirements 1, 2, 3 (no secrets), partial 8 (reconcile exists).

- [ ] **Step 1: Implement the module**

See `docs/specs/active/2026-04-18-run-history.md#storage-layer` for the canonical type and function signatures. Copy verbatim:

- `HistoryEntry`, `TrimmedResult`, `Store` types
- `loadHistory(endpointId)` returns the bucket or `[]`
- `pushHistory(entry)` prepends, caps at 20
- `clearEndpointHistory(endpointId)` removes that endpoint's bucket
- `reconcileHistory(validIds: Set<string>)` drops buckets whose key is not in the set
- `trimResult(r, validationErrors)` returns a `TrimmedResult`, with `rawText` trimmed to 100 KB and `rawTruncated` set accordingly

Constants: `MAX_PER_ENDPOINT = 20`, `MAX_BODY_BYTES = 100 * 1024`, `HISTORY_KEY = 'zwaggen:history'`.

- [ ] **Step 2: Unit tests**

`apps/web/tests/storage/history.test.ts`. Required cases (from the spec's Testing section):
- `pushHistory` appends newest-first.
- `pushHistory` caps at 20 (push 21, expect length 20, first is the latest).
- Separate buckets for different endpoint IDs.
- `loadHistory('unknown')` → `[]`.
- `clearEndpointHistory` scoped to one bucket.
- `reconcileHistory` drops missing IDs, keeps valid ones.
- `trimResult` with a 200 KB `rawText` → `rawTruncated: true`, `rawText.length === 100 KB`.
- `trimResult` with small `rawText` → `rawTruncated: false` (or undefined) and text intact.

Idb-keyval defaults to real IndexedDB. Fake-indexeddb is the usual test polyfill. Add `import 'fake-indexeddb/auto'` to `tests/setup.ts` if not already present (check first — otherwise the whole storage test folder is the tell on whether it's set up).

- [ ] **Step 3**: `pnpm --filter web test -- storage/history` — green.

- [ ] **Step 4: Commit**

`feat(storage): run history bucket in IndexedDB with cap + reconcile`

---

### Task 2: Store-level delete + reconcile

**Files:**
- Modify: `apps/web/src/state/store.ts`
- Modify: `apps/web/src/ui/EndpointEditor.tsx` (wire delete button to the new action)
- Create: `apps/web/tests/state/store.history.test.ts`

**Acceptance criteria covered:** spec requirement 8.

- [ ] **Step 1: Add `deleteEndpoint` action**

In `store.ts`:

```ts
import { clearEndpointHistory, reconcileHistory } from '../storage/history';

// within the store:
async deleteEndpoint(id: string) {
  const spec = get().spec;
  const next = { ...spec, endpoints: spec.endpoints.filter((e) => e.id !== id) };
  await get().setSpec(next);
  if (get().selectedEndpointId === id) set({ selectedEndpointId: null });
  await clearEndpointHistory(id);
},
```

Declare `deleteEndpoint(id: string): Promise<void>` on the `SpecStore` interface.

- [ ] **Step 2: Reconcile on spec replace / new / discard**

In `replaceSpec`, `newSpec`, and `discardDraft`, after the spec is in place, call:

```ts
await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
```

For `newSpec` (empty-spec factory), this will reconcile against an empty Set — i.e., wipe history entirely. Intentional: "New spec" should start clean.

- [ ] **Step 3: Wire the editor's delete button**

`EndpointEditor.tsx` currently (likely) deletes via `setSpec({...spec, endpoints: filtered})`. Replace that call with `useSpecStore.getState().deleteEndpoint(endpoint.id)`. Confirm the existing delete button still has a confirm dialog — if not, keep current behavior.

- [ ] **Step 4: Store tests**

`apps/web/tests/state/store.history.test.ts`:
- Seed: two endpoints `A` and `B`, history for both via `pushHistory`.
- Call `deleteEndpoint('A')`. Assert: store has only `B`; `loadHistory('A')` returns `[]`; `loadHistory('B')` still has its entry.
- Call `replaceSpec(specWithOnlyB, null)` — assert `loadHistory('A')` is empty (reconciled).
- Call `newSpec()` — assert both buckets are wiped.

- [ ] **Step 5**: `pnpm --filter web test -- store.history` — green.

- [ ] **Step 6: Commit**

`feat(state): deleteEndpoint + spec-open history reconcile`

---

### Task 3: History drawer + RunPanel wiring

**Files:**
- Create: `apps/web/src/ui/HistoryDrawer.tsx`
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Modify: `apps/web/src/i18n/locales/en.json` / `zh-TW.json`
- Create: `apps/web/tests/ui/RunPanel.history.test.tsx`

**Acceptance criteria covered:** spec requirements 4, 5, 6, 7.

- [ ] **Step 1: Push history after Send**

In `RunPanel.tsx`'s `onSend`, after `setResult(...)`:

```ts
await pushHistory({
  id: crypto.randomUUID(),
  at: Date.now(),
  endpointId: endpoint!.id,
  inputs: { path: pathVals, query: queryVals, headers: headerVals, body },
  baseUrlUsed: baseUrl,
  useProxyUsed:
    (useProxy ?? (endpoint!.useProxy === 'inherit' ? spec.useProxyDefault : endpoint!.useProxy)) === true,
  result: trimResult(res, validationErrors),
});
setHistoryEpoch((n) => n + 1);
```

Where `historyEpoch` is a new `useState<number>(0)` passed into the drawer so it re-loads on each send.

- [ ] **Step 2: Drawer component**

`apps/web/src/ui/HistoryDrawer.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearEndpointHistory, loadHistory, type HistoryEntry } from '../storage/history';
import { IconClock, IconPlay, IconTrash } from './icons';
import { ResponseView } from './ResponseView';

interface Props {
  endpointId: string;
  epoch: number;
  onReplay: (e: HistoryEntry) => void;
}

export function HistoryDrawer({ endpointId, epoch, onReplay }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHistory(endpointId).then((list) => { if (alive) setEntries(list); });
    return () => { alive = false; };
  }, [endpointId, epoch]);

  async function clear() {
    if (!confirm('Clear history for this endpoint?')) return;
    await clearEndpointHistory(endpointId);
    setEntries([]);
    setOpenId(null);
  }

  if (entries.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-500">
        {t('noHistory')}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 text-xs">
        <div className="flex items-center gap-1 font-medium text-slate-600">
          <IconClock width={12} height={12} /> {t('history')}
        </div>
        <button className="text-slate-400 hover:text-red-600" onClick={() => void clear()}>
          <IconTrash width={12} height={12} />
          <span className="ml-1">{t('clearHistory')}</span>
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {entries.map((e) => {
          const isOpen = openId === e.id;
          return (
            <li key={e.id}>
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                <button
                  className="flex-1 text-left hover:text-brand-700"
                  onClick={() => setOpenId(isOpen ? null : e.id)}
                >
                  <time>{new Date(e.at).toLocaleTimeString()}</time>
                  {' · '}
                  <span>{e.result.status ?? e.result.errorKind ?? '—'}</span>
                  {e.result.latencyMs != null && <span> · {e.result.latencyMs}ms</span>}
                  {e.result.validationErrors && e.result.validationErrors.length > 0 && (
                    <span className="ml-1 text-red-600">
                      ✗ {e.result.validationErrors.length}
                    </span>
                  )}
                </button>
                <button
                  className="btn-icon"
                  title={t('replay')}
                  aria-label={t('replay')}
                  onClick={() => onReplay(e)}
                >
                  <IconPlay />
                </button>
              </div>
              {isOpen && <StoredResponse entry={e} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StoredResponse({ entry }: { entry: HistoryEntry }) {
  const { t } = useTranslation();
  let body: unknown;
  try { body = entry.result.rawText ? JSON.parse(entry.result.rawText) : undefined; } catch { body = entry.result.rawText; }
  return (
    <div className="border-t border-slate-100 bg-slate-50/50 p-2">
      {entry.result.rawTruncated && (
        <div className="mb-1 text-[11px] text-amber-700">{t('truncated')}</div>
      )}
      {body !== undefined && (
        <ResponseView body={body} errors={entry.result.validationErrors ?? []} />
      )}
    </div>
  );
}
```

Icons: add `IconClock` and `IconPlay` to `icons.tsx` following existing glyph patterns if missing.

- [ ] **Step 3: Replay handler**

In `RunPanel`:

```ts
function onReplay(e: HistoryEntry) {
  setPathVals(e.inputs.path);
  setQueryVals(e.inputs.query);
  setHeaderVals(e.inputs.headers);
  setBodyText(e.inputs.body !== undefined ? JSON.stringify(e.inputs.body, null, 2) : '{}');
  setBaseUrl(e.baseUrlUsed);
  setUseProxy(e.useProxyUsed);
}
```

- [ ] **Step 4: Mount the drawer**

Under the live response block in `RunPanel.tsx`:

```tsx
<HistoryDrawer endpointId={endpoint.id} epoch={historyEpoch} onReplay={onReplay} />
```

- [ ] **Step 5: i18n keys**

Add to both locales:
- en: `"history": "History"`, `"replay": "Replay"`, `"clearHistory": "Clear"`, `"noHistory": "No runs yet. Click Send to record one."`, `"truncated": "Response body truncated at 100 KB."`
- zh-TW: `"history": "歷史"`, `"replay": "重放"`, `"clearHistory": "清除"`, `"noHistory": "尚無紀錄。點選「送出」以記錄一筆。"`, `"truncated": "回應內文已截斷（100 KB 上限）。"`

- [ ] **Step 6: Component test**

`apps/web/tests/ui/RunPanel.history.test.tsx`:
- Mock `fetch` to return a canned 200 JSON. Select an endpoint. Click Send. Assert one entry appears in the drawer with the right status / latency.
- Click the row. Assert an expanded `<ResponseView>` shows the response body.
- Click Replay on the row. Assert the form inputs reflect the stored values (change values before clicking; then reset via replay; assert reset).
- Click Clear, stub `confirm → true`. Assert the drawer shows `noHistory`.
- Seed history with a `rawTruncated: true` entry (via direct IDB set or `pushHistory`). Expand. Assert the truncated banner renders.

- [ ] **Step 7**: `pnpm --filter web test -- RunPanel.history` — green.

- [ ] **Step 8: Commit**

`feat(web): run history drawer with replay + clear`

---

### Task 4: Full-suite verification + UX pass + docs move

**Files:** none.

- [ ] **Step 1**: `pnpm --filter web test` — entire web suite green.
- [ ] **Step 2**: `pnpm --filter web test:e2e` — green. (The smoke doesn't assert on history, but shouldn't break.)
- [ ] **Step 3: Manual UX pass**

`pnpm dev`:

1. Define an endpoint `GET /get` pointing at `https://httpbin.org`. Click Send three times. Drawer shows three entries, newest first.
2. Click the middle entry. Response body expands below. Close it. Expand a different one.
3. Click Replay on the oldest entry. The Body textarea / path values / query values reset. Inspect without sending.
4. Delete the endpoint. Recreate one (new uuid). Drawer is empty.
5. `new Spec`. Drawer is empty. Previous endpoint's history is gone from IDB (verify via DevTools → Application → IndexedDB → keyval-store → `zwaggen:history`).
6. Hit a 500 on some endpoint. History captures the error; expanding shows the response body or the classified error hint.
7. Send an endpoint whose response is > 100 KB (e.g., hit `httpbin.org/bytes/150000`). Expand. Confirm the truncated banner renders.

- [ ] **Step 4: Move docs**

On merge:
- Move `docs/specs/active/2026-04-18-run-history.md` → `docs/specs/done/`.
- Move `docs/plans/active/2026-04-18-run-history.md` → `docs/plans/done/`.
- Commit: `docs: mark run-history done`.

---

## Open Questions
None at plan time. The "spec fingerprint" for cross-spec isolation is explicitly out of scope — revisit if users report collision pain.
