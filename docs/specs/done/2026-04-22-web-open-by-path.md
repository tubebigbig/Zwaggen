# Spec — Open-by-path entry point in `apps/web`

## Problem

`apps/web` only knows how to load a spec via in-app interaction: the user clicks **Open** in the header, the File System Access dialog (or classic `<input type="file">`) prompts for a file, and the picked spec replaces the current one. There is no programmatic boot-time path to "open this specific spec on launch."

The future Electron desktop app needs exactly this. When the user double-clicks a `.zwag` file in Finder/Explorer, Electron starts up and the renderer needs to load that file — without showing a picker the user already implicitly answered. The shell will hand the renderer a path; the renderer needs a slot to receive it.

A secondary use case is browser deep-linking: a shareable URL like `https://play.zwaggen.com/?spec=https://gist.github.com/.../spec.json` that opens a remote spec on page load (CORS permitting). Same boot-time slot, different source.

This is the third of three Electron prep jobs (after the core transport abstraction and the web storage abstraction). It depends on the storage abstraction landing first because it adds a new method to the `SpecStorage` interface.

## Success criteria

- A new `openByPath(path: string)` method on the `SpecStorage` interface returns `Promise<OpenedFile | null>`. The browser default rejects with a clear "openByPath is not supported in the browser" error (browsers cannot read arbitrary file paths). The desktop impl will read via Node `fs/promises` and return `{ handle: path, name: basename, text }`.
- A new module `apps/web/src/state/boot.ts` exports `resolveBootIntent(): Promise<BootIntent>` that inspects the current URL on first render and returns one of:
  - `{ kind: 'load-url'; url: string }` when `?spec=<absolute-http(s)-url>` is present.
  - `{ kind: 'load-path'; path: string }` when `?specPath=<path>` is present.
  - `{ kind: 'none' }` when no boot intent is present (existing draft-restore flow runs).
- `App.tsx`'s mount effect performs the boot in order: resolve intent → if `load-url`, fetch and parse → if `load-path`, call `getStorage().openByPath(path)` → on success, call `replaceSpec(spec, handle)`; on failure, render the existing `LoadErrorModal` with the source label and error message → if `kind: 'none'`, fall back to the existing `restoreDraft()` call.
- URL params take precedence over the autosaved draft. If both a URL param and a draft exist, the URL param wins (the user (or shell) explicitly asked for this spec).
- After a successful boot-time load, the URL param is **stripped** via `history.replaceState(null, '', '/')` so a refresh doesn't re-trigger the load (and so the URL doesn't leak the spec source on subsequent navigation).
- Boot-time errors render through the existing `LoadErrorModal` UI. Reuse the same i18n strings (`loadErrorTitle`, `loadErrorFilenameLabel`, etc.). For boot failures, the "filename" field shows the URL or path that was attempted.
- Tests cover: URL-param parsing (both keys), `?spec=<url>` happy path with a mocked `fetch`, `?spec=<url>` failure (network error / non-JSON / schema error), `?specPath=<path>` delegates to storage, browser default's `openByPath` throws, missing-param falls through to `kind: 'none'`, URL-param stripping after a successful load.
- No regression in any existing test.
- TODO entry "Open-by-path entry point in `apps/web`" ticked.

## Out of scope

- **A `window.__zwaggenInitialSpec` global JS API.** URL params + storage's `openByPath` cover both the desktop launch flow and the browser deep-link flow. A global var would be a third path with no consumer for v1.
- **OS file-association registration.** Telling Finder/Explorer that `.zwag` opens with the Zwaggen app is the desktop project's job (in Electron's `main` process via `app.setAsDefaultProtocolClient` / Info.plist).
- **Drag-drop a file onto the window to open.** Useful, but unrelated to launch-time intent. Separate UI work.
- **`?spec=<url>` resolution with credentials, custom headers, or auth.** v1 does a plain `fetch(url)` with default browser semantics. Cross-origin specs need permissive CORS or hosting on the same origin.
- **Caching deep-linked specs in localStorage / IDB.** v1 fetches fresh on each load (after URL strip, refresh would normally land on the autosaved draft anyway).
- **The desktop's `openByPath` implementation.** That ships with the desktop project.
- **Recents recording for boot-time loads.** Recents (added in the storage prep) are recorded by `pickOpen`; `openByPath` does NOT auto-record. The desktop shell's launch flow can call `recordRecent` separately if it wants the file in the menu. Browser `?spec=<url>` loads also don't record (they're transient deep-links, not "recently opened files" in the file-management sense).

## Approach

### Files

**Create:**
- `apps/web/src/state/boot.ts` — `resolveBootIntent()` and the `BootIntent` discriminated union.
- `apps/web/tests/state/boot.test.ts` — unit tests for the URL parsing and intent resolution.
- `apps/web/tests/state/bootLoad.test.tsx` — integration test for App.tsx's mount-effect routing (or extend an existing App test if one exists).

**Modify:**
- `apps/web/src/storage/spec-storage.ts` — add `openByPath(path: string): Promise<OpenedFile | null>` to the `SpecStorage` interface. Browser default's impl: `async openByPath() { throw new Error('openByPath is not supported in the browser; use the Open dialog.'); }`.
- `apps/web/src/App.tsx` — replace the lone `useEffect(() => { void restoreDraft(); }, [restoreDraft])` with a richer boot effect that awaits `resolveBootIntent()`, dispatches accordingly, and renders a boot `LoadErrorModal` when a load fails. Add local state `bootError` symmetric to AppHeader's existing `loadError`.
- `apps/web/src/state/store.ts` — no signature change; `replaceSpec(spec, handle)` is already the right API for boot-time replacement.
- `apps/web/tests/storage/spec-storage.test.ts` — extend with two tests: browser default's `openByPath` throws; the swap mechanism still routes `openByPath` to a custom impl.
- `docs/specs/done/2026-04-22-zwaggen-desktop.md` (in this same repo) — short note linking to this prep work in the "Renderer boot" section.

**Untouched:**
- `AppHeader.tsx`'s `loadError` state and modal rendering — the boot path renders its own modal in `App.tsx`. They never overlap (boot fires once before user can open anything).

### `BootIntent` shape

```ts
// apps/web/src/state/boot.ts
export type BootIntent =
  | { kind: 'load-url'; url: string }
  | { kind: 'load-path'; path: string }
  | { kind: 'none' };

export function resolveBootIntent(search: string = window.location.search): BootIntent {
  const params = new URLSearchParams(search);
  const url = params.get('spec');
  if (url && /^https?:\/\//i.test(url)) return { kind: 'load-url', url };
  const path = params.get('specPath');
  if (path) return { kind: 'load-path', path };
  return { kind: 'none' };
}
```

`resolveBootIntent` accepts `search` as an arg so tests can pass arbitrary query strings without messing with `window.location`.

`?spec=<url>` is restricted to `http://` and `https://` schemes — `file://`, `data:`, `javascript:` etc. are silently ignored (the function returns `{ kind: 'none' }` for them). Unknown schemes are not "errors" worthy of the modal; they're dropped as if the param wasn't there. Rationale: a hostile bookmark crafted with `?spec=javascript:...` shouldn't pop a modal that names the URL — silent rejection is safer.

### App.tsx boot effect

Replace:

```ts
useEffect(() => { void restoreDraft(); }, [restoreDraft]);
```

with:

```ts
useEffect(() => {
  let cancelled = false;
  (async () => {
    const intent = resolveBootIntent();
    if (intent.kind === 'none') {
      await restoreDraft();
      return;
    }
    try {
      let text: string;
      let label: string;
      let handle: FileRef | null = null;
      if (intent.kind === 'load-url') {
        const resp = await fetch(intent.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        text = await resp.text();
        label = intent.url;
      } else {
        const opened = await getStorage().openByPath(intent.path);
        if (!opened) throw new Error('openByPath returned null');
        text = opened.text;
        label = opened.name;
        handle = opened.handle;
      }
      const spec = fromJSON(JSON.parse(text));
      if (!cancelled) {
        await replaceSpec(spec, handle);
        history.replaceState(null, '', '/');
      }
    } catch (err) {
      if (!cancelled) {
        const filename = intent.kind === 'load-url' ? intent.url : intent.path;
        setBootError({ filename, message: err instanceof Error ? err.message : String(err) });
      }
    }
  })();
  return () => { cancelled = true; };
}, [restoreDraft, replaceSpec]);
```

`bootError` state lives in App.tsx; `LoadErrorModal` renders below the main shell when set.

### Why URL stripping after success

- A page reload would re-trigger the load (cheap if it's a draft restore, but for `?spec=<url>` it re-fetches from the network on every refresh).
- The URL param is a one-shot intent, not persistent state. Once acted on, it should be removed so further navigation behaves normally.
- Preserves shareability: the original URL still works for first-time visitors; refreshing your own tab doesn't re-trigger.

### Browser default's `openByPath`

```ts
openByPath: async (_path: string) => {
  throw new Error('openByPath is not supported in the browser; use the Open dialog instead.');
},
```

Browsers can't resolve arbitrary file paths to file contents. The fallback message is clear and non-fatal — boot will surface it through `LoadErrorModal` if `?specPath=...` is somehow used in a browser context. Desktop overrides this with a Node `fs/promises.readFile`-backed impl.

### URL param naming

- `?spec=<url>` — the spec lives at this URL. Browser-friendly. Self-explanatory.
- `?specPath=<path>` — the spec lives at this filesystem path. Desktop-friendly. The distinct param name keeps the two flows from accidentally crossing (a URL like `?spec=/local/path` would be a malformed deep-link; surface it as no-op rather than trying to resolve it).

### Test plan

`apps/web/tests/state/boot.test.ts`:

1. `resolveBootIntent('')` → `{ kind: 'none' }`.
2. `resolveBootIntent('?spec=https://x/spec.json')` → `{ kind: 'load-url', url: 'https://x/spec.json' }`.
3. `resolveBootIntent('?spec=javascript:alert(1)')` → `{ kind: 'none' }` (non-http(s) scheme rejected).
4. `resolveBootIntent('?specPath=/users/me/spec.zwag')` → `{ kind: 'load-path', path: '/users/me/spec.zwag' }`.
5. `?spec` takes precedence if both keys present (or document the order — pick one and assert).

`apps/web/tests/storage/spec-storage.test.ts` (extend):
- Browser default's `openByPath` throws with the expected message.
- `setStorage({ openByPath: ... })` swaps the impl correctly.

`apps/web/tests/state/bootLoad.test.tsx`:
- Render `<App />` with `window.location.search` mocked to `?spec=<url>`; mock `fetch` to return a valid spec JSON; assert the store ends up with that spec (or the URL is stripped from history).
- Same with `?specPath=<path>`; mock `getStorage().openByPath` via `setStorage(custom)` to return a fixture.
- Failure path: `fetch` rejects → `LoadErrorModal` text appears in the DOM.

### Risks

- **Stacking on `plan/web-storage-abstraction`.** This branch depends on that one. If the user merges PRs out of order (#3 before #2), the storage interface changes get pulled in via #3 — review-confusion risk. Mitigation: PR description for #3 explicitly says "merge after #2". GitHub's "base" branch can be set to `plan/web-storage-abstraction` so the diff stays clean.
- **`history.replaceState(null, '', '/')`** loses any non-spec query params or hash. v1 has none; if hash-routing or other params get added later, the strip should preserve them. Acceptable today; revisit when there's something to preserve.
- **Boot effect runs in StrictMode** (see `main.tsx`'s `<React.StrictMode>`), which double-invokes effects in dev. The `cancelled` guard prevents double-application. Production unaffected.
- **`fetch` for `?spec=<url>` is browser-only** (well, `globalThis.fetch` works in Node 18+, but the boot module only runs in the renderer). No portability concern.
- **Schema validation errors** during `fromJSON` get surfaced through the modal with the URL/path as the "filename". Same UX as opening a corrupt file via the dialog today.

## Done definition

- `SpecStorage` interface gains `openByPath`; browser default throws clearly.
- `state/boot.ts` exports `resolveBootIntent` + `BootIntent` type.
- `App.tsx` boot effect awaits intent + dispatches to fetch / openByPath / restoreDraft as appropriate.
- Successful boot-time load strips the query string.
- Failures render `LoadErrorModal` with the source label.
- 7+ new tests cover boot resolution, browser-default openByPath rejection, swap, and end-to-end load (success + failure).
- `pnpm --filter web lint && pnpm --filter web test` clean.
- TODO entry ticked, spec + plan moved to `done/`.
- Branch `plan/web-open-by-path` pushed; user opens PR (base = `plan/web-storage-abstraction`).
