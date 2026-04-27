# Live codegen preview panel (Slice 2B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A right-side panel showing the full spec's generated TS / Zod / Client / OpenAPI, debounced as the user edits. Toggled via a new AppHeader button. Coexists with the existing Settings sidebar at ≥1200px.

**Architecture:** Persisted `uiPrefs.livePreviewOpen` flag drives panel visibility; new `<LivePreviewPanel>` slot in App.tsx's right-side flex chain (LEFT of the existing Settings sidebar). Tiny `useDebounce(spec, 300)` hook; codegen calls wrapped in try/catch with error UI fallback. No new deps.

**Tech Stack:** React, vitest, `@zwaggen/core` codegen functions (already exported after Slice 1).

---

### Spec

See `docs/specs/active/2026-04-27-codegen-live-preview.md`. Constraints:

- All output is full-spec (no `{ only }` filter).
- Debounce 300ms.
- Below 1200px the panel doesn't render.
- Errors caught and shown in-pane (no panel crash).
- Existing `livePreview` i18n key reused; new `livePreviewError` key added.

---

### Task 1: `uiPrefs.livePreviewOpen` + AppHeader toggle button + i18n

**Files:**
- Modify: `apps/web/src/state/uiPrefs.ts` — add `livePreviewOpen: boolean` to type + DEFAULTS.
- Modify: `apps/web/src/ui/AppHeader.tsx` — insert new toggle button after `<ExportMenu>`, before "Run All".
- Modify: `apps/web/src/i18n/locales/en.json` + `zh-TW.json` — add `livePreviewError` (and `close` if missing).

- [ ] **Step 1: Add `livePreviewOpen` to uiPrefs**

In `apps/web/src/state/uiPrefs.ts`:

```ts
export interface UiPrefs {
  // ... existing fields ...
  livePreviewOpen: boolean;
}

const DEFAULTS: UiPrefs = {
  // ... existing defaults ...
  livePreviewOpen: false,
};
```

- [ ] **Step 2: AppHeader button**

Find the `<ExportMenu>` render in `AppHeader.tsx` (search). Insert AFTER it, BEFORE the "Run All" button:

```tsx
<button
  type="button"
  className={`btn-icon ${livePreviewOpen ? 'text-brand-600 bg-brand-50' : ''}`}
  aria-label={t('livePreview')}
  aria-pressed={livePreviewOpen}
  title={t('livePreview')}
  onClick={() => setUiPref('livePreviewOpen', !livePreviewOpen)}
>
  <IconPanelRight />
</button>
```

Pull `livePreviewOpen` from `useUiPrefs()` at the top of the component. Import `setUiPref` and `IconPanelRight`.

- [ ] **Step 3: i18n keys**

`en.json`:

```json
"livePreviewError": "Codegen failed:"
```

(Reuse `livePreview` already added in Slice 2A. Reuse existing `dismiss`/`close` for the panel-header X — verify which exists; LoadErrorModal uses `dismiss`.)

`zh-TW.json`:

```json
"livePreviewError": "程式碼產生失敗："
```

- [ ] **Step 4: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/codegen-live-preview
pnpm --filter web lint
pnpm --filter web test
```

All green. The new button renders but doesn't open a panel yet (Task 2 lands the panel; Task 4 wires it into App.tsx).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/uiPrefs.ts apps/web/src/ui/AppHeader.tsx apps/web/src/i18n/locales
git commit -m "$(cat <<'EOF'
feat(web): livePreviewOpen uiPref + AppHeader toggle button

Foundation for the live codegen preview panel (Slice 2B). The
button currently toggles state but the panel doesn't exist yet —
follows in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `useDebounce` hook + `<LivePreviewPanel>` shell with stub content

**Files:**
- Create: `apps/web/src/hooks/useDebounce.ts`
- Create: `apps/web/src/ui/LivePreviewPanel.tsx`

- [ ] **Step 1: `useDebounce` hook**

```ts
// apps/web/src/hooks/useDebounce.ts
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
```

- [ ] **Step 2: `LivePreviewPanel` shell with stub tabs**

Create `apps/web/src/ui/LivePreviewPanel.tsx` with the modal-less aside shell from the spec, BUT with `buildPreviewTabs` returning placeholder tabs. Task 3 fills in the codegen.

```tsx
import { useMemo, useState, useRef } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { Spec } from '@zwaggen/core';
import { useSpecStore } from '../state/store';
import { setUiPref } from '../state/uiPrefs';
import { useDebounce } from '../hooks/useDebounce';
import { IconX } from './icons';

interface PreviewTab { id: string; label: string; output: string; filename: string; isError: boolean }

export function LivePreviewPanel() {
  const { t } = useTranslation();
  const spec = useSpecStore((s) => s.spec);
  const debouncedSpec = useDebounce(spec, 300);
  const tabs: PreviewTab[] = useMemo(() => buildPreviewTabs(debouncedSpec, t), [debouncedSpec, t]);
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <aside
      role="complementary"
      aria-label={t('livePreview')}
      className="thin-scroll flex w-96 flex-col overflow-hidden border-l border-slate-200 bg-slate-50"
    >
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
        <h2 className="panel-title">{t('livePreview')}</h2>
        <button className="btn-icon" aria-label={t('dismiss')} onClick={() => setUiPref('livePreviewOpen', false)}>
          <IconX />
        </button>
      </header>
      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 border-b border-slate-200 px-2 py-1.5">
          {tabs.map((tab) => {
            const isActive = tab.id === active?.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(tab.id)}
                className={`rounded px-2 py-1 text-xs ${isActive ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      {active && <PreviewPane key={active.id} tab={active} />}
    </aside>
  );
}

function PreviewPane({ tab }: { tab: PreviewTab }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tab.output);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
      setCopyFailed(true);
    }
  }

  function download() {
    const blob = new Blob([tab.output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs">
        <button type="button" onClick={copy} className="btn">
          {copied ? t('copied') : t('copyOutput')}
        </button>
        <button type="button" onClick={download} className="btn">
          {t('downloadOutput')}
        </button>
        {copyFailed && <span className="text-amber-700">{t('copyFallbackHint')}</span>}
        <span className="ml-auto font-mono text-slate-500">{tab.filename}</span>
      </div>
      <pre className={`thin-scroll flex-1 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs ${tab.isError ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-800'}`}>
        {tab.output}
      </pre>
      <textarea ref={fallbackRef} value={tab.output} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />
    </div>
  );
}

function buildPreviewTabs(_spec: Spec, _t: TFunction): PreviewTab[] {
  // STUB — Task 3 fills with actual codegen.
  return [{ id: 'stub', label: 'TODO', output: '(empty)', filename: 'stub.txt', isError: false }];
}
```

- [ ] **Step 3: Verify build + lint**

```bash
pnpm --filter web build
pnpm --filter web lint
```

All green. No tests yet for this file — Task 5 adds them.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useDebounce.ts apps/web/src/ui/LivePreviewPanel.tsx
git commit -m "$(cat <<'EOF'
feat(web): LivePreviewPanel shell + useDebounce hook

Stub buildPreviewTabs returns one placeholder tab; Task 3 wires the
real generators (TS / Zod / Client / OpenAPI). Panel still not
rendered anywhere — Task 4 slots it into App.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire 4 tabs (full-spec generators) + try/catch error handling

**Files:**
- Modify: `apps/web/src/ui/LivePreviewPanel.tsx` — replace `buildPreviewTabs` stub.

- [ ] **Step 1: Replace `buildPreviewTabs`**

```ts
import { generateTs, generateZod, generateClient, toOpenApi } from '@zwaggen/core';

function buildPreviewTabs(spec: Spec, t: TFunction): PreviewTab[] {
  const safe = (label: string, filename: string, fn: () => string): PreviewTab => {
    try {
      return { id: filename, label, output: fn(), filename, isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { id: filename, label, output: `${t('livePreviewError')}\n\n${message}`, filename, isError: true };
    }
  };
  return [
    safe(t('exportTabTypes'),   'types.ts',     () => generateTs(spec)),
    safe(t('exportTabSchemas'), 'schemas.ts',   () => generateZod(spec)),
    safe(t('exportTabClient'),  'client.ts',    () => generateClient(spec)),
    safe(t('exportTabOpenApi'), 'openapi.json', () => JSON.stringify(toOpenApi(spec) as unknown, null, 2)),
  ];
}
```

(Reuses i18n keys added in Slice 2A: `exportTabTypes`, `exportTabSchemas`, `exportTabClient`, `exportTabOpenApi`. The `livePreviewError` key was added in Task 1.)

- [ ] **Step 2: Verify**

```bash
pnpm --filter web build
pnpm --filter web lint
```

Both green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/ui/LivePreviewPanel.tsx
git commit -m "$(cat <<'EOF'
feat(web): live preview tabs emit full-spec TS / Zod / Client / OpenAPI

Each generator wrapped in try/catch — codegen errors (illegal file
types, type-key collisions) display in the pane body instead of
crashing the panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: App.tsx layout integration + responsive hiding below 1200px

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Import + render**

Add `import { LivePreviewPanel } from './ui/LivePreviewPanel';` to App.tsx imports.

In the right-side flex chain (around line 122-185), slot the panel BEFORE the Settings sidebar so the order is: editor | preview | settings.

```tsx
const { sidebarCollapsed, livePreviewOpen } = useUiPrefs();
// ...

{livePreviewOpen && isWide && <LivePreviewPanel />}

{pinned && (
  <aside className="...">{/* existing Settings sidebar */}</aside>
)}
```

`isWide = useBreakpoint('(min-width: 1200px)')` already exists in App.tsx. Reuse it.

The pinned-vs-overlay logic for the Settings sidebar can stay as-is — the live preview is independent.

- [ ] **Step 2: Verify build + visual sanity**

```bash
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green. Existing 398 web tests should still pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(web): mount LivePreviewPanel in App.tsx

Renders left of the Settings sidebar at ≥1200px when
uiPrefs.livePreviewOpen is true. Below 1200px, the panel doesn't
mount even when the toggle state is on — the AppHeader button
still flips state so it activates when the user resizes wider.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tests + tick TODO + move spec/plan + final smoke

**Files:**
- Create: `apps/web/tests/ui/LivePreviewPanel.test.tsx`
- Create: `apps/web/tests/ui/AppHeader.livePreview.test.tsx`
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: `LivePreviewPanel.test.tsx`**

```tsx
import 'fake-indexeddb/auto';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LivePreviewPanel } from '../../src/ui/LivePreviewPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';

function preText(): string { return document.querySelector('pre')?.textContent ?? ''; }

function fixture(typeName = 'User'): Spec {
  const s = emptySpec();
  s.types[typeName] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  return s;
}

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(fixture(), null);
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('renders 4 tabs and TS by default', () => {
  render(<LivePreviewPanel />);
  expect(screen.getByRole('tab', { name: /types\.ts/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /schemas\.ts/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /client\.ts/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /openapi\.json/i })).toBeInTheDocument();
  expect(preText()).toMatch(/(interface|type)\s+User/);
});

it('switching to schemas.ts shows zod output', async () => {
  render(<LivePreviewPanel />);
  await userEvent.click(screen.getByRole('tab', { name: /schemas\.ts/i }));
  expect(preText()).toContain('UserSchema');
});

it('spec change updates output after debounce', async () => {
  vi.useFakeTimers();
  render(<LivePreviewPanel />);
  // Default tab still TS; replace the spec with a different type name.
  await act(async () => {
    await useSpecStore.getState().replaceSpec(fixture('Account'), null);
    vi.advanceTimersByTime(350);
  });
  expect(preText()).toMatch(/(interface|type)\s+Account/);
});

it('codegen error shows in pane without crashing', async () => {
  // Seed a spec with a key-collision (e.g. "auth/User" + "auth_User") to force
  // detectKeyCollisions to throw.
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['auth_User'] = { kind: 'object', fields: [] };
  await useSpecStore.getState().replaceSpec(spec, null);
  render(<LivePreviewPanel />);
  expect(preText()).toMatch(/Codegen failed/);
  // Panel still rendered
  expect(screen.getByRole('complementary')).toBeInTheDocument();
});
```

- [ ] **Step 2: `AppHeader.livePreview.test.tsx`**

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useUiPrefs } from '../../src/state/uiPrefs';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
});

it('AppHeader live-preview button toggles uiPrefs.livePreviewOpen', async () => {
  render(<AppHeader />);
  const btn = screen.getByRole('button', { name: /live preview/i });
  expect(btn).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(btn);
  expect(btn).toHaveAttribute('aria-pressed', 'true');
  // and persisted in uiPrefs
  expect(useUiPrefs.getState().livePreviewOpen).toBe(true);
});
```

(Adjust `useUiPrefs.getState()` if uiPrefs isn't a Zustand store; the actual API may differ — read `apps/web/src/state/uiPrefs.ts` to confirm.)

- [ ] **Step 3: Tick TODO**

In `docs/TODO.md`, find:

```
- [ ] Live codegen preview in the web app — ...
```

Replace with:

```
- [x] Live codegen preview in the web app — right-side panel toggled via AppHeader button; debounced 300ms; 4 tabs (TS / Zod / Client / OpenAPI) wrap codegen calls in try/catch so collision/file-type errors show in-pane. Coexists with Settings sidebar at ≥1200px. See `docs/plans/done/2026-04-27-codegen-live-preview.md`.
```

Update "Last updated" stamp to `2026-04-27 (codegen-live-preview)`.

- [ ] **Step 4: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-27-codegen-live-preview.md docs/specs/done/
git mv docs/plans/active/2026-04-27-codegen-live-preview.md docs/plans/done/
```

- [ ] **Step 5: Final smoke**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/ui docs/TODO.md
git commit -m "$(cat <<'EOF'
docs+test: ship codegen-live-preview — tick TODO, add panel + header tests

LivePreviewPanel test covers 4-tab render, tab switch, debounced
spec-change update, and the codegen-error fallback. AppHeader test
verifies the toggle button drives uiPrefs.livePreviewOpen with
correct aria-pressed state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 5 tasks ticked.
- AppHeader button toggles `uiPrefs.livePreviewOpen` with correct `aria-pressed`.
- Panel renders 4 tabs with full-spec generated output.
- Each tab updates after 300ms debounce on spec change.
- Codegen errors caught + shown in pane (panel doesn't crash).
- Below 1200px: panel doesn't mount.
- Settings sidebar coexists at ≥1200px.
- All tests + lint green.
- TODO entry ticked.
- Spec + plan moved to `done/`.
- Branch `plan/codegen-live-preview` ready to push.
