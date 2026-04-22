# Open-by-path entry point in `apps/web` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a boot-time slot that lets the desktop shell (`?specPath=<path>`) or a browser deep-link (`?spec=<url>`) load a specific spec on launch. Extend `SpecStorage` with `openByPath` so the desktop impl can plug in later.

**Architecture:** A new `state/boot.ts` module exposes `resolveBootIntent()` that parses URL params into a discriminated union (`load-url` / `load-path` / `none`). `App.tsx`'s mount effect awaits the intent and dispatches: fetch + parse for `load-url`, `getStorage().openByPath` for `load-path`, existing `restoreDraft()` for `none`. Failures render the existing `LoadErrorModal` with the URL/path as the "filename." On success, the URL param is stripped via `history.replaceState`. Browser default's `openByPath` throws a clear "not supported" error; desktop overrides this later.

**Tech Stack:** TypeScript, vitest, React, no new deps. Stacks on `plan/web-storage-abstraction`.

---

### Spec

See `docs/specs/active/2026-04-22-web-open-by-path.md` for full context. Key constraints:

- This branch is stacked on `plan/web-storage-abstraction`. PR base must be set to that branch (not `main`) so the diff stays clean. PRs must merge in order: storage first, then this one.
- URL precedence: URL param > autosaved draft. URL param is stripped after a successful load.
- `?spec=<url>` is restricted to `http://`/`https://`. Other schemes return `kind: 'none'` (silent rejection).
- Boot errors render the existing `LoadErrorModal` (reuse i18n strings: `loadErrorTitle`, `loadErrorFilenameLabel`, `loadErrorLearnMore`).
- Browser default's `openByPath` throws; desktop will override.
- No global `window.__zwaggen*` JS API. URL params + storage cover both flows.

---

### Task 1: Write failing tests for `resolveBootIntent`

**Files:**
- Create: `apps/web/tests/state/boot.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// apps/web/tests/state/boot.test.ts
import { expect, test } from 'vitest';
import { resolveBootIntent } from '../../src/state/boot';

test('empty search returns kind: none', () => {
  expect(resolveBootIntent('')).toEqual({ kind: 'none' });
});

test('?spec=<https url> returns load-url', () => {
  expect(resolveBootIntent('?spec=https://example.com/spec.json')).toEqual({
    kind: 'load-url',
    url: 'https://example.com/spec.json',
  });
});

test('?spec=<http url> returns load-url', () => {
  expect(resolveBootIntent('?spec=http://example.com/spec.json')).toEqual({
    kind: 'load-url',
    url: 'http://example.com/spec.json',
  });
});

test('?spec=<javascript:...> is silently rejected as kind: none', () => {
  expect(resolveBootIntent('?spec=javascript:alert(1)')).toEqual({ kind: 'none' });
});

test('?spec=<file:///...> is silently rejected as kind: none', () => {
  expect(resolveBootIntent('?spec=file:///tmp/spec.json')).toEqual({ kind: 'none' });
});

test('?specPath=<path> returns load-path', () => {
  expect(resolveBootIntent('?specPath=/users/me/spec.zwag')).toEqual({
    kind: 'load-path',
    path: '/users/me/spec.zwag',
  });
});

test('both ?spec and ?specPath: ?spec wins', () => {
  expect(resolveBootIntent('?spec=https://x/y.json&specPath=/a/b')).toEqual({
    kind: 'load-url',
    url: 'https://x/y.json',
  });
});

test('encoded URL value decodes correctly', () => {
  const encoded = encodeURIComponent('https://example.com/path with spaces.json');
  expect(resolveBootIntent(`?spec=${encoded}`)).toEqual({
    kind: 'load-url',
    url: 'https://example.com/path with spaces.json',
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- boot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit (red state)**

```bash
git add apps/web/tests/state/boot.test.ts
git commit -m "test(web): add failing tests for resolveBootIntent"
```

---

### Task 2: Implement `state/boot.ts` to make Task 1's tests pass

**Files:**
- Create: `apps/web/src/state/boot.ts`

- [ ] **Step 1: Write the implementation**

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

- [ ] **Step 2: Run Task 1's tests to verify they pass**

Run: `pnpm --filter web test -- boot.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/state/boot.ts
git commit -m "feat(web): add resolveBootIntent for URL-param boot routing"
```

---

### Task 3: Add `openByPath` to `SpecStorage` (failing tests + impl)

**Files:**
- Modify: `apps/web/tests/storage/spec-storage.test.ts` (append)
- Modify: `apps/web/src/storage/spec-storage.ts`

- [ ] **Step 1: Append failing tests for `openByPath`**

Add these to `apps/web/tests/storage/spec-storage.test.ts` (after the existing tests, but before any closing braces):

```ts
test('default storage openByPath throws "not supported in the browser"', async () => {
  await expect(getStorage().openByPath('/any/path')).rejects.toThrow(
    /openByPath is not supported in the browser/i,
  );
});

test('setStorage swaps openByPath to a custom impl', async () => {
  const custom: SpecStorage = {
    loadDraft: async () => null,
    saveDraft: async () => {},
    clearDraft: async () => {},
    supportsNativePicker: () => false,
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    listRecent: async () => [],
    recordRecent: async () => {},
    openByPath: async (path) => ({ handle: path, name: 'fake.zwag', text: '{}' }),
  };
  setStorage(custom);
  const opened = await getStorage().openByPath('/x.zwag');
  expect(opened).toEqual({ handle: '/x.zwag', name: 'fake.zwag', text: '{}' });
});
```

Note: the existing `fake` constant in the swap test (test #5) already exists — these are NEW tests that build a fresh `custom` impl with `openByPath` filled in. The existing `fake` in test #5 needs `openByPath` added to satisfy the interface.

Edit the existing test #5's `fake` to add the missing method:

```ts
const fake: SpecStorage = {
  loadDraft: async () => { calls.push('loadDraft'); return null; },
  saveDraft: async () => { calls.push('saveDraft'); },
  clearDraft: async () => { calls.push('clearDraft'); },
  supportsNativePicker: () => false,
  pickOpen: async () => { calls.push('pickOpen'); return null; },
  pickSave: async () => { calls.push('pickSave'); return null; },
  readFile: async () => ({ text: '', name: '' }),
  writeFile: async () => { calls.push('writeFile'); },
  listRecent: async () => [],
  recordRecent: async () => { calls.push('recordRecent'); },
  openByPath: async () => null,   // <-- add
};
```

- [ ] **Step 2: Run tests to verify the two new tests fail (and the swap test would type-error if not patched)**

Run: `pnpm --filter web test -- spec-storage.test.ts`
Expected: the two new tests FAIL (`openByPath is not a function`); the swap test compiles and passes.

- [ ] **Step 3: Add `openByPath` to the interface and the browser default**

In `apps/web/src/storage/spec-storage.ts`:

Add to the `SpecStorage` interface (after `recordRecent`):

```ts
  /** Read a spec from a filesystem path. Browser throws — desktop reads via Node fs. */
  openByPath(path: string): Promise<OpenedFile | null>;
```

Add to `browserDefault` (after `recordRecent`):

```ts
  openByPath: async (_path: string) => {
    throw new Error('openByPath is not supported in the browser; use the Open dialog instead.');
  },
```

- [ ] **Step 4: Run tests to verify everything passes**

Run: `pnpm --filter web test -- spec-storage.test.ts`
Expected: all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/storage/spec-storage.ts apps/web/tests/storage/spec-storage.test.ts
git commit -m "feat(web): add openByPath to SpecStorage interface (browser throws)"
```

---

### Task 4: Wire boot intent into `App.tsx`

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add new imports**

Open `apps/web/src/App.tsx`. The existing imports include `useEffect, useState` from react. Add:

```ts
import { fromJSON } from '@zwaggen/core';
import { LoadErrorModal } from './ui/LoadErrorModal';
import { resolveBootIntent } from './state/boot';
import { getStorage, type FileRef } from './storage/spec-storage';
```

- [ ] **Step 2: Pull `replaceSpec` from the store and add boot-error state**

In the App component body, change:

```ts
const { spec, setSpec, restoreDraft } = useSpecStore();
```

to:

```ts
const { spec, setSpec, restoreDraft, replaceSpec } = useSpecStore();
const [bootError, setBootError] = useState<{ filename: string; message: string } | null>(null);
```

- [ ] **Step 3: Replace the restoreDraft effect**

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
      const parsed = fromJSON(JSON.parse(text));
      if (cancelled) return;
      await replaceSpec(parsed, handle);
      window.history.replaceState(null, '', '/');
      // `label` retained in case of future logging; intentionally unused for now.
      void label;
    } catch (err) {
      if (cancelled) return;
      const filename = intent.kind === 'load-url' ? intent.url : intent.path;
      setBootError({ filename, message: err instanceof Error ? err.message : String(err) });
    }
  })();
  return () => { cancelled = true; };
}, [restoreDraft, replaceSpec]);
```

- [ ] **Step 4: Render the boot LoadErrorModal**

At the end of the App component's returned JSX (just before the closing `</div>` of the outer `<div className="flex h-screen flex-col bg-slate-100 text-slate-900">`), add:

```tsx
{bootError && (
  <LoadErrorModal
    filename={bootError.filename}
    message={bootError.message}
    onClose={() => setBootError(null)}
  />
)}
```

- [ ] **Step 5: Run web tests**

Run: `pnpm --filter web test`
Expected: all green. The existing tests don't set URL params, so the boot effect resolves to `kind: 'none'` and falls through to `restoreDraft()` — no behavioural change.

- [ ] **Step 6: Run web lint**

Run: `pnpm --filter web lint`
Expected: clean. If `label` triggers an unused-variable error, swap to `void` discard or remove entirely.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): boot from ?spec=<url> or ?specPath=<path> with LoadErrorModal fallback"
```

---

### Task 5: Add an integration test for boot routing

**Files:**
- Create: `apps/web/tests/state/bootLoad.test.tsx`

- [ ] **Step 1: Write the integration test**

```tsx
// apps/web/tests/state/bootLoad.test.tsx
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { App } from '../../src/App';
import { setStorage, resetStorage, type SpecStorage } from '../../src/storage/spec-storage';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

const minimalSpec = JSON.stringify({
  ...emptySpec(),
  info: { ...emptySpec().info, name: 'Boot Test', baseUrl: 'http://api' },
});

function setLocation(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  resetStorage();
  setLocation('');
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false, selectedEndpointId: null });
});

afterEach(() => {
  resetStorage();
  cleanup();
  vi.restoreAllMocks();
});

test('?spec=<url> fetches and replaces the spec; URL is stripped on success', async () => {
  setLocation('?spec=https://example.com/spec.json');
  globalThis.fetch = vi.fn(async () => new Response(minimalSpec, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as any;

  render(<App />);

  await waitFor(() => {
    expect(useSpecStore.getState().spec.info.name).toBe('Boot Test');
  });
  expect(window.location.search).toBe('');
});

test('?specPath=<path> delegates to storage.openByPath', async () => {
  setLocation('?specPath=/users/me/spec.zwag');
  const custom: SpecStorage = {
    loadDraft: async () => null,
    saveDraft: async () => {},
    clearDraft: async () => {},
    supportsNativePicker: () => false,
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    listRecent: async () => [],
    recordRecent: async () => {},
    openByPath: async (path) => ({ handle: path, name: 'spec.zwag', text: minimalSpec }),
  };
  setStorage(custom);

  render(<App />);

  await waitFor(() => {
    expect(useSpecStore.getState().spec.info.name).toBe('Boot Test');
  });
  expect(window.location.search).toBe('');
});

test('?spec=<url> fetch failure renders the LoadErrorModal', async () => {
  setLocation('?spec=https://example.com/missing.json');
  globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' })) as any;

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
  });
});

test('no URL param falls through to restoreDraft', async () => {
  setLocation('');
  // Default storage's loadDraft returns null in jsdom (idb-keyval has no draft) — App proceeds with the empty spec.
  render(<App />);
  // No fetch and no openByPath called — assert the spec stays empty.
  expect(useSpecStore.getState().spec.info.name).toBe(emptySpec().info.name);
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter web test -- bootLoad.test.tsx`
Expected: all 4 tests green.

If the test environment doesn't expose `@testing-library/react` already, check `apps/web/package.json` and `vitest.config.ts`. The web app already has Testing Library (used by `tests/ui/*.test.tsx`) — just import the same way other tests do.

- [ ] **Step 3: Run the full web suite**

Run: `pnpm --filter web lint && pnpm --filter web test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/state/bootLoad.test.tsx
git commit -m "test(web): integration test for App boot routing"
```

---

### Task 6: Tick TODO and move spec + plan to `done/`

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan from `active/` to `done/`

- [ ] **Step 1: Tick the TODO entry**

Open `docs/TODO.md`. Find:

```
- [ ] _(prep for Desktop)_ Open-by-path entry point in `apps/web` — accept a spec path / blob via constructor / URL param so the desktop shell can pass "open this file" intent on launch.
```

Replace with:

```
- [x] _(prep for Desktop)_ Open-by-path entry point in `apps/web` — `?spec=<url>` (browser deep-link) and `?specPath=<path>` (desktop launch) URL params drive a boot-time load; `SpecStorage.openByPath` slot for the desktop impl. See `docs/plans/done/2026-04-22-web-open-by-path.md`.
```

Update the "Last updated" line at the top of `docs/TODO.md` to `2026-04-22 (web-open-by-path)`.

- [ ] **Step 2: Move spec and plan to done/**

```bash
git mv docs/specs/active/2026-04-22-web-open-by-path.md docs/specs/done/
git mv docs/plans/active/2026-04-22-web-open-by-path.md docs/plans/done/
```

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: ship web-open-by-path — move spec+plan to done, tick TODO"
```

---

## Self-Review Checklist (controller, after all tasks complete)

- All six tasks ticked.
- `pnpm --filter web lint && pnpm --filter web test` clean.
- `?spec=<url>` and `?specPath=<path>` both supported; both strip the URL on success.
- Browser default's `openByPath` throws clearly.
- Boot errors render `LoadErrorModal`.
- Branch `plan/web-open-by-path` ready to push (PR base = `plan/web-storage-abstraction`).
