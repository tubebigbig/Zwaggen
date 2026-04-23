# Spec — Zwaggen Desktop slice 4: hardening polish

## Problem

Slices 1–3 shipped a working local-dev Electron app with packaging, file association, and recents. Three rounds of code review surfaced a backlog of polish items: real bugs (data-loss races, hung HTTP requests), defensive hardening (renderer can't be trusted to send hostnames), and DX papercuts (two-terminal dev flow, missing CI). None block local development, but the local-test-first track isn't really "done" until they're addressed.

This is **slice 4 of 4**, the last slice on the local-test-first track. After this lands, the desktop app is feature-complete for development; remaining work (code signing, auto-update, GitHub Releases workflow) is explicitly deferred until publishing time.

Stacks on `plan/desktop-recents-and-fileassoc` (slice 3).

## Success criteria

- **Cloud-metadata IP blocklist** in the IPC HTTP handler. Hosts `169.254.169.254` (AWS/Azure/GCP IMDS), `100.100.100.200` (Alibaba Cloud), `metadata.google.internal`, and link-local `fd00::ec2:0:0:0` are rejected at `isTransportRequest` time. A spec author can no longer trick a desktop user into doxxing IAM credentials. Error returned: `"refusing to fetch cloud-metadata host"`.
- **Per-request timeout** on the IPC HTTP handler via `AbortSignal.timeout(30_000)`. Hung or infinite-stream endpoints abort cleanly after 30 seconds; the renderer sees a `cors-or-network` error (the existing `classifyError` path handles AbortError → timeout).
- **Recents writes serialized** behind a single in-flight promise chain. Two parallel `recordRecent` calls no longer overwrite each other on disk.
- **`recordRecent` rejects non-existent paths** — silent no-op (or thrown error, implementer's call) when the supplied path doesn't `existsSync`. A renderer can no longer pollute the on-disk store or the OS recent-docs surface with garbage.
- **`open-file` events buffered as an array**, not a single slot. All buffered paths are drained on first `createWindow` (the latest one wins as the spec to load; earlier ones are discarded with a warning). Once a window exists, subsequent `open-file` events forward immediately.
- **`onMenuAction` becomes StrictMode-safe.** The bridge's `onMenuAction(cb)` returns an unsubscribe function; the `AppHeader` effect calls it on cleanup. In dev StrictMode (where effects fire twice), no duplicate handler accumulates.
- **`pnpm desktop:dev` root script** runs both Vite and Electron concurrently. Backed by `concurrently` (already a transitive dep) or a 5-line shell wrapper — implementer's call.
- **CI runs the desktop unit tests** on PRs. New step `pnpm --filter @zwaggen/desktop test` added to `.github/workflows/test.yml`. The Playwright Electron e2e is **not** added to CI in this slice — headless Electron e2e on GitHub Actions Linux requires `xvfb-run` plumbing that's its own follow-up.
- **Icon iconset cleanup is try/finally** in `build-icons.mjs` so a failed `iconutil` doesn't leave the temp dir behind.
- **`_headers` and `_redirects` excluded** from the bundled web/ resources via electron-builder's per-resource filter. They're Cloudflare-only metadata, harmless inside Electron but pointless to ship.
- **Tests** for each behavioral change:
  - Cloud-metadata IPs rejected (positive cases for each).
  - Timeout aborts a stalled handler (mock `fetch` that never resolves; assert the handler rejects within ~50ms after a configurable shorter timeout for the test).
  - Recents serialization: two parallel `recordRecent` calls produce a final on-disk state containing both entries.
  - `recordRecent` with a non-existent path is a no-op.
  - `onMenuAction` returns an unsubscribe function that detaches the listener.
- All previous slices' tests still pass.
- TODO entry "Zwaggen Desktop slice 4 — hardening polish" ticked.

## Out of scope

- **Code signing / notarization** — deferred per user direction.
- **Auto-update** — depends on signing + a release server.
- **CI matrix for desktop e2e** — needs `xvfb-run` on Linux + Playwright Electron headless tweaks. Worth its own slice.
- **Refactoring `bootstrap.ts` openByPath flow into a shared helper** (slice 3 review #9) — DRY for DRY's sake; defer.
- **Compression tuning** in `electron-builder.yml`. The default `normal` setting produces the 264 MB `.app` from slice 2 — acceptable for v0. Don't touch unless a user actually complains.
- **Replacing `existsSync` in `listRecents` with async stat** — fixing a non-issue (10 entries × microseconds is fine on local FS; network FS hangs are documented).
- **Linux `MimeType` xdg-mime registration script** — AppImage's `.desktop` file declaration is enough; system-wide MIME registration is the user's responsibility.

## Approach

### Files

**Modify:**
- `apps/desktop/electron/ipc.ts` — add cloud-metadata blocklist to `isTransportRequest`; add `AbortSignal.timeout(30_000)` to `handleHttp`.
- `apps/desktop/electron/recents.ts` — wrap mutations in a serial promise chain; add `existsSync` guard to `recordRecent`.
- `apps/desktop/electron/main.ts` — change `pendingOpenPath: string | null` → `pendingOpenPaths: string[]`; drain on createWindow; once `mainWindow` exists, forward to it. Adjust the `app.on('open-file')` and `extractSpecPath(process.argv)` reconciliation.
- `apps/desktop/electron/preload.ts` — `onMenuAction` returns the unsubscribe function (pattern: `() => ipcRenderer.removeListener(...)`).
- `apps/web/src/types/zwaggen-bridge.ts` — `onMenuAction` signature returns `() => void`.
- `apps/web/src/ui/AppHeader.tsx` — the `useEffect` that subscribes now calls the returned unsubscribe in cleanup. Add `[]` deps still — the bridge is stable for the app's lifetime.
- `apps/desktop/scripts/build-icons.mjs` — wrap the macOS `iconutil` block in try/finally so the iconset is removed even on error.
- `apps/desktop/electron-builder.yml` — `extraResources` gains a per-resource `filter` that excludes `_headers` and `_redirects`.
- `apps/desktop/electron/__tests__/ipc.test.ts` — add tests for blocklist + timeout.
- `apps/desktop/electron/__tests__/recents.test.ts` — add tests for serialization + existsSync guard.
- `apps/desktop/electron/__tests__/builder-config.test.ts` — assert the `filter` setting on `extraResources`.
- `apps/desktop/package.json` — add a `dev:concurrent` script (or rename existing).
- root `package.json` — add `desktop:dev` script that calls `concurrently "pnpm --filter @zwaggen/web dev" "pnpm --filter @zwaggen/desktop dev"`.
- `.github/workflows/test.yml` — add a step that runs `pnpm --filter @zwaggen/desktop build && pnpm --filter @zwaggen/desktop test`.
- `apps/desktop/README.md` — mention the one-command dev script + cloud-metadata blocklist note.

**Create:**
- (none — all changes are modifications to existing files.)

### Cloud-metadata blocklist

```ts
// in apps/desktop/electron/ipc.ts
const BLOCKED_HOSTS = new Set([
  '169.254.169.254',           // AWS / Azure / GCP IMDS
  '100.100.100.200',           // Alibaba Cloud
  'metadata.google.internal',  // GCP DNS alias
]);

function isBlockedHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (BLOCKED_HOSTS.has(u.hostname.toLowerCase())) return true;
    // IPv6 link-local cloud metadata: fd00:ec2:: prefix
    if (u.hostname.startsWith('[fd00:ec2:') || u.hostname.startsWith('fd00:ec2:')) return true;
    return false;
  } catch {
    return true;   // malformed URL — let isTransportRequest's other checks reject upstream
  }
}

export function isTransportRequest(v: unknown): v is TransportRequest {
  // ... existing checks ...
  if (isBlockedHost(r.url as string)) return false;
  return true;
}
```

The blocklist sits inside the validator so rejection becomes the existing `'invalid http payload'` error message — consistent with other validation failures. (Alternative: dedicated error message. The plan defers to whichever the implementer prefers; both are testable.)

### Timeout

```ts
// in apps/desktop/electron/ipc.ts
const HTTP_TIMEOUT_MS = 30_000;

export async function handleHttp(payload: unknown): Promise<TransportResponse> {
  if (!isTransportRequest(payload)) throw new Error('invalid http payload');
  const resp = await fetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.bodyText,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  // ... unchanged ...
}
```

`AbortSignal.timeout` throws an `AbortError` in Node 18+. The renderer's `classifyError` (in `@zwaggen/core/runner/classify-error.ts`) already maps `AbortError → kind: 'timeout'` — no change needed there.

For testability, the timeout constant should be exported so tests can stub a shorter value, or the function gains an optional `opts` parameter. Implementer chooses the lowest-friction shape.

### Recents serialization

```ts
// in apps/desktop/electron/recents.ts
let serialQueue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = serialQueue.then(fn, fn);
  serialQueue = next;
  return next;
}

export function recordRecent(path: string): Promise<void> {
  return serial(async () => {
    if (!existsSync(path)) return;     // existsSync guard
    const entries = await load();
    const filtered = entries.filter((e) => e.path !== path);
    const next: RecentEntry[] = [{ path, openedAt: Date.now() }, ...filtered].slice(0, LIMIT);
    await save(next);
    app.addRecentDocument(path);
  });
}

export function clearRecents(): Promise<void> {
  return serial(async () => {
    await save([]);
    app.clearRecentDocuments();
  });
}
```

The queue is module-local; `__resetForTests` should also reset it to a fresh `Promise.resolve()` so tests don't inherit pending work from siblings.

### `open-file` buffering

```ts
let pendingOpenPaths: string[] = [];

app.on('open-file', (e, p) => {
  e.preventDefault();
  if (mainWindow) mainWindow.webContents.send('zwaggen:open-file', { path: p });
  else pendingOpenPaths.push(p);
});

app.whenReady().then(async () => {
  registerIpc({ getWin: () => mainWindow, onRecentsChanged: rebuildMenu });
  await rebuildMenu();
  const argvPath = extractSpecPath(process.argv);
  // open-file events from the OS are more authoritative than argv (they fire
  // for both initial launch and subsequent double-clicks). When both are
  // present, prefer the latest open-file.
  const initial = pendingOpenPaths[pendingOpenPaths.length - 1] ?? argvPath;
  // Drain remaining buffered paths AFTER the window exists (they'll go via
  // webContents.send below).
  const replayAfter = pendingOpenPaths.slice(0, -1);
  pendingOpenPaths = [];
  createWindow(initial);

  // Forward any earlier buffered paths to the now-active window.
  if (mainWindow) {
    for (const p of replayAfter) mainWindow.webContents.send('zwaggen:open-file', { path: p });
  }
  // ...
});
```

If only one path was buffered, it becomes `initial` and `replayAfter` is empty — same behaviour as today. If two arrived before whenReady (rare), the latest opens as the spec, the first follows as an additional `open-file` event the renderer can handle.

### `onMenuAction` cleanup

Preload changes to:

```ts
onMenuAction: (cb: (action: string) => void) => {
  const handler = (_e: unknown, action: unknown) => cb(String(action));
  ipcRenderer.on('zwaggen:menu', handler);
  return () => { ipcRenderer.removeListener('zwaggen:menu', handler); };
},
```

Bridge type:

```ts
onMenuAction?(cb: (action: string) => void): () => void;
```

`AppHeader` effect:

```tsx
useEffect(() => {
  const bridge = (window as { zwaggen?: ZwaggenBridge }).zwaggen;
  if (!bridge?.onMenuAction) return;
  const unsubscribe = bridge.onMenuAction((action) => {
    if (action === 'open') void openSpec();
    else if (action === 'save') void saveSpec();
    else if (action === 'save-as') void saveSpec({ forceDialog: true });
  });
  return () => unsubscribe();
}, []);
```

### Concurrently dev script

Pick the simplest path. Adding `concurrently` as a workspace devDep is one line; alternatively, the user's preferred shell can do `&` + `wait`. `concurrently` gives nice prefixed colored output and SIGINT handling for free — worth the dep. Add to root `package.json`:

```jsonc
"scripts": {
  "desktop:dev": "concurrently --kill-others-on-fail --names web,desktop --prefix-colors blue,magenta \"pnpm --filter @zwaggen/web dev\" \"pnpm --filter @zwaggen/desktop dev\""
}
```

Document in `apps/desktop/README.md`: "Run `pnpm desktop:dev` from the repo root to launch both terminals at once."

### CI step

Append to `.github/workflows/test.yml` after the existing `@zwaggen/cli` block:

```yaml
- name: build + test + lint (@zwaggen/desktop)
  run: |
    pnpm --filter @zwaggen/desktop build
    pnpm --filter @zwaggen/desktop test
```

(No `lint` script in `apps/desktop` — TypeScript checks happen via tsup's transform. If `lint` is added later, this step grows.)

### Risks

- **AbortSignal.timeout is Node 18+.** The desktop's runtime is Electron 41 ↔ Node 22 — no concern. CI runs Node 20 — also fine.
- **Recents serial queue + Electron lifecycle.** If the app quits while a recents write is in-flight, the in-memory queue is lost. The on-disk JSON might be stale by one entry. Acceptable — recents are best-effort.
- **`onMenuAction` cleanup tightens the contract.** The bridge type goes from `void` return to `() => void`. Any caller that ignored the return value still works (just doesn't unsubscribe). Browser users (`window.zwaggen` undefined) are unaffected.
- **`concurrently` interactive output.** Some CI / CI-like environments don't like ANSI color. The script targets local dev only; CI doesn't run it.
- **CI desktop step needs Electron downloaded.** `pnpm install` triggers Electron's postinstall normally; if pnpm 10's "ignored postinstall" hits CI, the desktop tests will fail. Mitigation: add `pnpm exec electron-postinstall` (or equivalent) to the CI step. Verify before merging.

## Done definition

- All 10 changes above land with their test coverage.
- `pnpm --filter @zwaggen/desktop test` is green and now covers blocklist, timeout, serial recents, existsSync guard.
- `pnpm --filter web test` is green (no regressions from `onMenuAction` signature change).
- `pnpm --filter @zwaggen/desktop e2e` is green (slice 1 e2e — no behaviour change for it).
- `pnpm desktop:dev` from the repo root launches Vite + Electron in one terminal.
- CI runs `@zwaggen/desktop test` on PRs.
- Spec + plan moved to `done/`. TODO entry ticked.
- Branch pushed; user opens PR with base = `plan/desktop-recents-and-fileassoc`.
