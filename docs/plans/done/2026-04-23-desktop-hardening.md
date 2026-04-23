# Zwaggen Desktop slice 4 — Hardening polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 10 polish items captured across slices 1–3 reviews so the local-test-first track is feature-complete: cloud-metadata blocklist, HTTP timeout, serialized recents, open-file array buffer, StrictMode-safe menu cleanup, one-command dev script, CI step, icon/extra-resources hygiene.

**Architecture:** Pure quality work. No new packages, no new public surface beyond `onMenuAction` returning a cleanup. Stacks on `plan/desktop-recents-and-fileassoc`.

**Tech Stack:** Existing — Electron, vitest, AbortSignal, concurrently. Add `concurrently` to root devDeps.

---

### Spec

See `docs/specs/active/2026-04-23-desktop-hardening.md`. Key constraints:

- Stacked PR — base must be `plan/desktop-recents-and-fileassoc`.
- No code signing (still deferred).
- E2E menu→AppHeader wiring is OUT of scope.

---

### Task 1: Cloud-metadata IP blocklist + HTTP timeout

**Files:**
- Modify: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/electron/__tests__/ipc.test.ts`

- [ ] **Step 1: Append failing tests for the new behaviours**

```ts
// in apps/desktop/electron/__tests__/ipc.test.ts (append at the bottom)

import { handleHttp as _handleHttp } from '../ipc';

test('isTransportRequest rejects cloud-metadata hosts', () => {
  expect(isTransportRequest({ method: 'GET', url: 'http://169.254.169.254/latest/meta-data/', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://100.100.100.200/latest/', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://metadata.google.internal/computeMetadata/v1/', headers: {} })).toBe(false);
  // case-insensitive
  expect(isTransportRequest({ method: 'GET', url: 'http://Metadata.Google.Internal/x', headers: {} })).toBe(false);
});

test('isTransportRequest still accepts non-blocked private LAN hosts', () => {
  // Slice 4 only blocks cloud-metadata IPs, NOT all private ranges
  expect(isTransportRequest({ method: 'GET', url: 'http://192.168.1.1/admin', headers: {} })).toBe(true);
  expect(isTransportRequest({ method: 'GET', url: 'http://10.0.0.1/x', headers: {} })).toBe(true);
});

test('handleHttp aborts when the underlying fetch never resolves', async () => {
  const fetchSpy = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason ?? new Error('aborted')));
  }));
  globalThis.fetch = fetchSpy as any;
  // The default 30s timeout is too long for a unit test. Use a fake timer to advance time.
  vi.useFakeTimers();
  const promise = handleHttp({ method: 'GET', url: 'http://example.com/slow', headers: {} });
  vi.advanceTimersByTime(31_000);
  await expect(promise).rejects.toBeInstanceOf(Error);
  vi.useRealTimers();
});
```

(Note: the third test uses fake timers so it doesn't actually wait 30s. If `AbortSignal.timeout` doesn't play nicely with fake timers, fall back to: export `HTTP_TIMEOUT_MS` from `ipc.ts` and have the test stub it via `vi.spyOn` to a smaller value.)

- [ ] **Step 2: Run — verify they fail**

```bash
pnpm --filter @zwaggen/desktop test -- ipc.test.ts
```

Expected: the 3 new tests FAIL (validators still accept blocked hosts; handleHttp has no timeout); 6 existing pass.

- [ ] **Step 3: Implement blocklist + timeout in `apps/desktop/electron/ipc.ts`**

Add near the top of the file (after the existing imports):

```ts
const HTTP_TIMEOUT_MS = 30_000;

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  '100.100.100.200',
  'metadata.google.internal',
]);

function isBlockedHost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return true;
    if (host.startsWith('[fd00:ec2:') || host.startsWith('fd00:ec2:')) return true;
    return false;
  } catch {
    return true;   // malformed URL — already covered by other checks, but be safe
  }
}
```

Update `isTransportRequest` to call `isBlockedHost` before returning true:

```ts
export function isTransportRequest(v: unknown): v is TransportRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.method !== 'string' || typeof r.url !== 'string') return false;
  if (typeof r.headers !== 'object' || r.headers === null) return false;
  if (r.bodyText !== undefined && typeof r.bodyText !== 'string') return false;
  if (!/^https?:\/\//i.test(r.url)) return false;
  if (isBlockedHost(r.url)) return false;
  return true;
}
```

Update `handleHttp` to add the timeout signal:

```ts
export async function handleHttp(payload: unknown): Promise<TransportResponse> {
  if (!isTransportRequest(payload)) throw new Error('invalid http payload');
  const resp = await fetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.bodyText,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  // ... rest unchanged ...
}
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @zwaggen/desktop test -- ipc.test.ts
```

Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/ipc.ts apps/desktop/electron/__tests__/ipc.test.ts
git commit -m "$(cat <<'EOF'
fix(desktop): block cloud-metadata hosts + 30s timeout on IPC HTTP

Defensive hardening: a malicious or buggy renderer can no longer trick
the desktop into hitting cloud IMDS endpoints (169.254.169.254 et al.)
and exfiltrating IAM credentials. Any fetch the main process accepts
also gets a 30s AbortSignal so a stalled endpoint can't hang the
process indefinitely.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Recents serialization + existsSync guard

**Files:**
- Modify: `apps/desktop/electron/recents.ts`
- Modify: `apps/desktop/electron/__tests__/recents.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// in apps/desktop/electron/__tests__/recents.test.ts (append)

test('parallel recordRecent calls do not lose entries', async () => {
  const a = join(dir, 'a.zwag');
  const b = join(dir, 'b.zwag');
  await writeFile(a, '{}');
  await writeFile(b, '{}');
  __resetForTests(storeFile);
  await Promise.all([recordRecent(a), recordRecent(b)]);
  const onDisk = JSON.parse(await readFile(storeFile, 'utf8'));
  // Both entries must survive the race; order is whichever serialised first
  expect(onDisk.map((e: any) => e.path).sort()).toEqual([a, b].sort());
});

test('recordRecent silently no-ops for non-existent paths', async () => {
  await recordRecent('/this/path/does/not/exist.zwag');
  expect(await listRecents()).toEqual([]);
});
```

- [ ] **Step 2: Run — verify they fail**

```bash
pnpm --filter @zwaggen/desktop test -- recents.test.ts
```

Expected: existing 6 pass; 2 new likely fail (the parallel test depends on whether your filesystem races; the existsSync test definitely fails because today's recordRecent calls `app.addRecentDocument` and saves the entry regardless of file existence).

- [ ] **Step 3: Implement serialization + existsSync guard in `apps/desktop/electron/recents.ts`**

Add a serial queue helper near the top:

```ts
let serialQueue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = serialQueue.then(fn, fn);
  serialQueue = next.catch(() => undefined);   // don't let a rejection poison the chain
  return next;
}
```

Wrap the mutating exports in `serial(...)`, and add the existsSync guard:

```ts
export function recordRecent(path: string): Promise<void> {
  return serial(async () => {
    if (!existsSync(path)) return;
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

Update `__resetForTests` to also reset the queue:

```ts
export function __resetForTests(testFile?: string): void {
  cachePath = testFile ?? null;
  cache = null;
  serialQueue = Promise.resolve();
}
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @zwaggen/desktop test -- recents.test.ts
```

Expected: 8/8 green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/recents.ts apps/desktop/electron/__tests__/recents.test.ts
git commit -m "$(cat <<'EOF'
fix(desktop): serialize recents writes + skip non-existent paths

Wraps recordRecent + clearRecents in a single in-flight promise chain so
parallel calls don't overwrite each other's on-disk JSON. recordRecent
now ignores paths that don't existsSync — a malicious renderer can no
longer pollute the on-disk store or the OS recent-docs surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `open-file` buffer array

**Files:**
- Modify: `apps/desktop/electron/main.ts`

- [ ] **Step 1: Update the main module**

Find the `let pendingOpenPath: string | null = null;` line. Replace:

```ts
let pendingOpenPaths: string[] = [];

app.on('open-file', (e, p) => {
  e.preventDefault();
  if (mainWindow) mainWindow.webContents.send('zwaggen:open-file', { path: p });
  else pendingOpenPaths.push(p);
});
```

In `app.whenReady().then(...)`, replace:

```ts
const initial = pendingOpenPath ?? extractSpecPath(process.argv);
pendingOpenPath = null;
createWindow(initial);
```

with:

```ts
const argvPath = extractSpecPath(process.argv);
const initial = pendingOpenPaths[pendingOpenPaths.length - 1] ?? argvPath;
const replayAfter = pendingOpenPaths.slice(0, -1);
pendingOpenPaths = [];
createWindow(initial);
if (mainWindow) {
  for (const p of replayAfter) mainWindow.webContents.send('zwaggen:open-file', { path: p });
}
```

- [ ] **Step 2: Verify slice 1 e2e and downstream tests**

```bash
pnpm --filter @zwaggen/desktop build
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop e2e
```

Expected: e2e green (it doesn't pass paths, so behaviour unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/main.ts
git commit -m "$(cat <<'EOF'
fix(desktop): buffer open-file events as an array

A second macOS open-file event before whenReady would clobber the first.
Now we buffer all paths, the latest becomes the launch spec, the rest
forward to the window once it exists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: StrictMode-safe `onMenuAction`

**Files:**
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/web/src/types/zwaggen-bridge.ts`
- Modify: `apps/web/src/ui/AppHeader.tsx`

- [ ] **Step 1: Update preload to return an unsubscribe function**

In `apps/desktop/electron/preload.ts`, replace the `onMenuAction` definition:

```ts
onMenuAction: (cb: (action: string) => void) => {
  const handler = (_e: unknown, action: unknown) => cb(String(action));
  ipcRenderer.on('zwaggen:menu', handler);
  return () => { ipcRenderer.removeListener('zwaggen:menu', handler); };
},
```

Same for `onOpenFile`:

```ts
onOpenFile: (cb: (payload: { path: string }) => void) => {
  const handler = (_e: unknown, payload: { path: string }) => cb(payload);
  ipcRenderer.on('zwaggen:open-file', handler);
  return () => { ipcRenderer.removeListener('zwaggen:open-file', handler); };
},
```

- [ ] **Step 2: Update bridge type**

In `apps/web/src/types/zwaggen-bridge.ts`, change return signatures:

```ts
onMenuAction?(cb: (action: string) => void): () => void;
onOpenFile(cb: (payload: { path: string }) => void): () => void;
```

- [ ] **Step 3: Update `AppHeader.tsx` to call cleanup**

Find the existing `useEffect` that subscribes:

```tsx
useEffect(() => {
  const w = window as { zwaggen?: { onMenuAction?: (cb: (action: string) => void) => void } };
  const bridge = w.zwaggen;
  if (!bridge?.onMenuAction) return;
  bridge.onMenuAction((action) => {
    if (action === 'open') void openSpec();
    else if (action === 'save') void saveSpec();
    else if (action === 'save-as') void saveSpec({ forceDialog: true });
  });
}, []);
```

Replace with:

```tsx
useEffect(() => {
  const bridge = (window as { zwaggen?: { onMenuAction?: (cb: (action: string) => void) => () => void } }).zwaggen;
  if (!bridge?.onMenuAction) return;
  const unsubscribe = bridge.onMenuAction((action) => {
    if (action === 'open') void openSpec();
    else if (action === 'save') void saveSpec();
    else if (action === 'save-as') void saveSpec({ forceDialog: true });
  });
  return () => unsubscribe();
}, []);
```

- [ ] **Step 4: Update `bootstrap.ts` to also clean up onOpenFile** (it's idempotent within an app's lifetime so cleanup isn't strictly required, but consistency is good).

In `apps/web/src/bootstrap.ts`, change:

```ts
bridge.onOpenFile(async ({ path }) => { ... });
```

The bridge `onOpenFile` now returns an unsubscribe; bootstrap captures and discards (it never unmounts). Add a comment:

```ts
// Bootstrap runs once per process — discard the unsubscribe; the listener
// lives for the app's lifetime.
bridge.onOpenFile(async ({ path }) => { ... });
```

(No actual code change needed; the new return type is just dropped. TypeScript is happy.)

- [ ] **Step 5: Run tests**

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/desktop test
```

Expected: all green. The `onOpenFile`/bootstrap test passes a callback that returns nothing (or `undefined`), and the production code captures the unsubscribe but never calls it — should still work.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/preload.ts apps/web/src/types/zwaggen-bridge.ts apps/web/src/ui/AppHeader.tsx apps/web/src/bootstrap.ts
git commit -m "$(cat <<'EOF'
fix(web,desktop): bridge subscriptions return unsubscribe; AppHeader cleans up

In dev StrictMode, AppHeader's useEffect fires twice — without cleanup
the menu-action handler accumulates and Open/Save fire two/three/N times
on subsequent menu clicks. onMenuAction and onOpenFile now both return
an unsubscribe function; AppHeader uses it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: One-command dev (`concurrently`) + CI step

**Files:**
- Modify: root `package.json`
- Modify: `.github/workflows/test.yml`
- Modify: `apps/desktop/README.md`

- [ ] **Step 1: Add `concurrently` to root devDeps + script**

```bash
pnpm add -wD concurrently
```

Then in root `package.json`, add to `scripts`:

```jsonc
"desktop:dev": "concurrently --kill-others-on-fail --names web,desktop --prefix-colors blue,magenta \"pnpm --filter @zwaggen/web dev\" \"pnpm --filter @zwaggen/desktop dev\""
```

- [ ] **Step 2: Add the desktop CI step**

Open `.github/workflows/test.yml`. After the existing `@zwaggen/cli` block, append:

```yaml
- name: build + test (@zwaggen/desktop)
  run: |
    pnpm --filter @zwaggen/desktop build
    pnpm --filter @zwaggen/desktop test
```

If `pnpm install` on CI doesn't install Electron's binary (pnpm 10 ignores postinstall by default), prepend:

```yaml
- name: install Electron binary (pnpm 10 ignores postinstall)
  run: node node_modules/electron/install.js
```

(Verify by reading `pnpm-workspace.yaml` for any `onlyBuiltDependencies` configuration that might already cover electron. If yes, skip the manual install.)

- [ ] **Step 3: Update README**

In `apps/desktop/README.md`, replace the two-terminal dev block with:

```markdown
Dev (one command via concurrently):
\`\`\`
pnpm desktop:dev
\`\`\`

Or two terminals if you prefer:
\`\`\`
pnpm --filter @zwaggen/web dev    # terminal 1
pnpm --filter @zwaggen/desktop dev   # terminal 2
\`\`\`
```

- [ ] **Step 4: Sanity check**

```bash
pnpm install
pnpm desktop:dev   # don't actually run it; just verify the script resolves
# Press Ctrl+C immediately if it does start; we just want to confirm the script exists.
```

(Skip the actual run — concurrently spawning Electron windows in this environment isn't useful. The script's existence + pnpm resolving it is enough.)

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .github/workflows/test.yml apps/desktop/README.md
git commit -m "$(cat <<'EOF'
chore(desktop): one-command dev + CI step

Root `pnpm desktop:dev` runs Vite + Electron via concurrently so devs
don't juggle two terminals. CI now builds + tests @zwaggen/desktop on
every PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Try/finally iconset cleanup + filter Cloudflare metadata from extraResources

**Files:**
- Modify: `apps/desktop/scripts/build-icons.mjs`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/electron/__tests__/builder-config.test.ts`

- [ ] **Step 1: Wrap iconset block in try/finally**

In `apps/desktop/scripts/build-icons.mjs`, replace the current darwin block:

```js
if (process.platform === 'darwin') {
  const iconset = resolve(OUT, 'icon.iconset');
  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset, { recursive: true });
  // ... pair writes ...
  await exec('iconutil', ['-c', 'icns', '-o', resolve(OUT, 'icon.icns'), iconset]);
  await rm(iconset, { recursive: true, force: true });
}
```

with:

```js
if (process.platform === 'darwin') {
  const iconset = resolve(OUT, 'icon.iconset');
  await rm(iconset, { recursive: true, force: true });
  try {
    await mkdir(iconset, { recursive: true });
    const macSizes = [16, 32, 64, 128, 256, 512, 1024];
    for (const s of macSizes) {
      if (s !== 1024) await writeFile(resolve(iconset, `icon_${s}x${s}.png`), findBuf(s));
      if (s !== 16) await writeFile(resolve(iconset, `icon_${s/2}x${s/2}@2x.png`), findBuf(s));
    }
    await exec('iconutil', ['-c', 'icns', '-o', resolve(OUT, 'icon.icns'), iconset]);
  } finally {
    await rm(iconset, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Filter Cloudflare metadata from extraResources**

Open `apps/desktop/electron-builder.yml`. Replace the `extraResources` block:

```yaml
extraResources:
  - from: ../web/dist
    to: web
    filter:
      - "**/*"
      - "!_headers"
      - "!_redirects"
```

- [ ] **Step 3: Update `builder-config.test.ts`**

Change the existing `extraResources` assertion:

```ts
expect(cfg.extraResources).toEqual([{
  from: '../web/dist',
  to: 'web',
  filter: ['**/*', '!_headers', '!_redirects'],
}]);
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @zwaggen/desktop test -- builder-config.test.ts
```

Expected: green.

- [ ] **Step 5: Regenerate icons to confirm the script still works**

```bash
pnpm --filter @zwaggen/desktop build:icons
git diff apps/desktop/build/   # should be empty (deterministic)
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/scripts/build-icons.mjs apps/desktop/electron-builder.yml apps/desktop/electron/__tests__/builder-config.test.ts
git commit -m "$(cat <<'EOF'
fix(desktop): try/finally iconset cleanup + filter cloudflare metadata

build-icons.mjs now removes the temp .iconset directory even when
iconutil fails. electron-builder no longer ships _headers / _redirects
(cloudflare-only metadata, harmless inside Electron but pointless
weight).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Tick TODO + move spec/plan + final verification

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Final test sweep**

```bash
pnpm install
pnpm --filter @zwaggen/core test
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/desktop build
pnpm --filter @zwaggen/desktop test
pnpm --filter @zwaggen/desktop e2e
```

Expected: every step green.

- [ ] **Step 2: Tick TODO**

Find:
```
- [ ] Zwaggen Desktop slice 4 — hardening polish (cloud-metadata IP blocklist on IPC HTTP, AbortSignal timeout, concurrently dev script, StrictMode menu cleanup, CI step for desktop tests).
```

Replace with:
```
- [x] Zwaggen Desktop slice 4 — hardening polish: cloud-metadata blocklist + 30s timeout on IPC HTTP, serialized recents writes + existsSync guard, open-file buffer-as-array, StrictMode-safe bridge subscriptions, `pnpm desktop:dev` one-command script, CI step for desktop tests, try/finally iconset cleanup, Cloudflare metadata excluded from package. See `docs/plans/done/2026-04-23-desktop-hardening.md`.
```

Update the strategic Desktop entry to acknowledge slice 4 completion:
```
- [ ] **Zwaggen Desktop (Electron)** — cross-platform spec editor + API client; HTTP bypasses browser CORS via Node main process. Slices 1–4 (local-test-first track) shipped 2026-04-23 — desktop is feature-complete for local development. Remaining: code signing + notarization, GitHub Releases workflow, auto-update. See `docs/specs/active/2026-04-22-zwaggen-desktop.md` (strategic) and `docs/plans/done/` for the slice-by-slice history.
```

Update "Last updated" to `2026-04-23 (desktop-hardening)`.

- [ ] **Step 3: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-23-desktop-hardening.md docs/specs/done/
git mv docs/plans/active/2026-04-23-desktop-hardening.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship desktop slice 4 (hardening) — local-test-first track complete

Slices 1–4 of the Zwaggen Desktop track are now feature-complete for
local development. Code signing + auto-update remain explicitly
deferred until publishing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 7 tasks ticked.
- Every test target green: core, web, web lint, desktop test, desktop e2e.
- `pnpm desktop:dev` resolves (script exists, arg-list well-formed).
- CI workflow file mentions the new `@zwaggen/desktop` step.
- Branch `plan/desktop-hardening` ready to push (PR base = `plan/desktop-recents-and-fileassoc`).
