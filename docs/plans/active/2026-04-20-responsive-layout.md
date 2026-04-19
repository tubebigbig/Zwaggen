# Responsive layout (RWD) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship responsive layout for `apps/web` so the app is usable at 768–1279px (tablet), with a 768-CSS-pixel minimum viewport so phones show the tablet layout instead of collapsing.

**Architecture:** Clamp the layout viewport at 768px via both `<meta name="viewport">` and `html { min-width }`. Add a `useBreakpoint` matchMedia hook. Reshape `AppHeader` so low-frequency actions collapse into a new `OverflowMenu` below `lg` (1024px). Reshape `App.tsx` so the right settings pane renders as a floating overlay (same pattern as `TypePanel`) below 1200px.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS (default breakpoints), Vitest + React Testing Library, Playwright.

**Spec:** [docs/specs/active/2026-04-20-responsive-layout.md](../../specs/active/2026-04-20-responsive-layout.md)

**Branch / worktree convention (from CLAUDE.md):** This plan should be executed inside `.worktrees/responsive-layout` on branch `plan/responsive-layout`. All git operations run inside that worktree. Commit per finished task. Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**New files:**

- `apps/web/src/hooks/useBreakpoint.ts` — `matchMedia` wrapper hook that returns `matches: boolean` for a CSS media query string.
- `apps/web/tests/hooks/useBreakpoint.test.tsx` — unit test for the hook under a mocked `matchMedia`.
- `apps/web/src/ui/OverflowMenu.tsx` — `⋯` trigger + dropdown using the `<details>` pattern already used by `ExportMenu`. Accepts children as menu items.
- `apps/web/tests/ui/OverflowMenu.test.tsx` — unit test for open/close, Escape, outside-click.
- `apps/web/tests/ui/AppHeader.overflow.test.tsx` — test that below `lg`, overflow menu contains Import/Compare/Export; at `≥lg`, those are inline.
- `apps/web/tests/ui/App.overlaySettings.test.tsx` — test that below 1200px, settings renders as rail + overlay; at ≥1200px, it stays pinned.
- `apps/web/e2e/responsive.spec.ts` — Playwright smoke at 900×800 and 1440×900.

**Modified files:**

- `apps/web/index.html` — add `min-width=768` to the viewport meta.
- `apps/web/src/index.css` — add `html { min-width: 768px; }` inside `@layer base`.
- `apps/web/src/ui/icons.tsx` — add `IconDotsHorizontal` export.
- `apps/web/src/ui/AppHeader.tsx` — split buttons into `hidden lg:inline-flex` + `lg:hidden` overflow menu. Add `truncate` to the read-mode name button.
- `apps/web/src/App.tsx` — use `useBreakpoint('(min-width: 1200px)')` to decide pinned-vs-overlay for the settings pane; render overlay with backdrop + Escape close when narrow.
- `apps/web/src/i18n/locales/en.json` — add `"more": "More"`.
- `apps/web/src/i18n/locales/zh-TW.json` — add `"more": "更多"`.

---

## Task 1: Viewport clamp (meta + CSS)

**Files:**
- Modify: `apps/web/index.html:5`
- Modify: `apps/web/src/index.css:5-15` (inside `@layer base`)

- [ ] **Step 1: Update the viewport meta tag**

Replace line 5 of `apps/web/index.html`:

```html
<meta name="viewport" content="width=device-width, min-width=768, initial-scale=1.0" />
```

- [ ] **Step 2: Add the CSS minimum-width rule**

In `apps/web/src/index.css`, inside the existing `@layer base { ... }` block, alongside the existing `html, body, #root { height: 100%; }` rule, add a `min-width` rule:

```css
@layer base {
  html,
  body,
  #root {
    height: 100%;
  }

  html {
    min-width: 768px;
  }

  /* ... rest unchanged ... */
}
```

- [ ] **Step 3: Start dev server and verify visually**

Run: `pnpm --filter web dev`

In a browser, use DevTools device toolbar to emulate:
- iPhone SE (375×667) — page should render at 768 CSS px wide; horizontal scroll appears; layout is intact, not compressed.
- iPad Mini (768×1024) — no horizontal scroll; layout fits.
- 1440×900 — unchanged from today.

Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html apps/web/src/index.css
git commit -m "feat(web): clamp layout viewport to 768px minimum"
```

---

## Task 2: `useBreakpoint` hook

**Files:**
- Create: `apps/web/src/hooks/useBreakpoint.ts`
- Create: `apps/web/tests/hooks/useBreakpoint.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/hooks/useBreakpoint.test.tsx` with:

```tsx
import { act, renderHook } from '@testing-library/react';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: (_: string, cb: Listener) => { listeners.add(cb); },
    removeEventListener: (_: string, cb: Listener) => { listeners.delete(cb); },
    addListener: () => {}, // legacy
    removeListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  (window as any).matchMedia = () => mql;
  return {
    emit(matches: boolean) {
      (mql as any).matches = matches;
      listeners.forEach((l) => l({ matches } as MediaQueryListEvent));
    },
  };
}

test('returns initial matches and updates on change', () => {
  const ctrl = mockMatchMedia(false);
  const { result } = renderHook(() => useBreakpoint('(min-width: 1200px)'));
  expect(result.current).toBe(false);
  act(() => ctrl.emit(true));
  expect(result.current).toBe(true);
  act(() => ctrl.emit(false));
  expect(result.current).toBe(false);
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `pnpm --filter web test tests/hooks/useBreakpoint.test.tsx`
Expected: fail with `Cannot find module '../../src/hooks/useBreakpoint'` or similar.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/hooks/useBreakpoint.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';

export function useBreakpoint(query: string): boolean {
  const mql = useMemo(
    () => (typeof window === 'undefined' ? null : window.matchMedia(query)),
    [query],
  );
  const [matches, setMatches] = useState(mql?.matches ?? false);

  useEffect(() => {
    if (!mql) return;
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mql]);

  return matches;
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm --filter web test tests/hooks/useBreakpoint.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useBreakpoint.ts apps/web/tests/hooks/useBreakpoint.test.tsx
git commit -m "feat(web): add useBreakpoint matchMedia hook"
```

---

## Task 3: Ellipsis icon

**Files:**
- Modify: `apps/web/src/ui/icons.tsx` (add one export near the other `Icon*` exports)

- [ ] **Step 1: Add the icon export**

In `apps/web/src/ui/icons.tsx`, below `IconDownload` (around line 28), add:

```tsx
export const IconDotsHorizontal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
);
```

- [ ] **Step 2: Verify tsc passes**

Run: `pnpm --filter web lint`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/ui/icons.tsx
git commit -m "feat(web): add IconDotsHorizontal ellipsis icon"
```

---

## Task 4: i18n — add `more` string

**Files:**
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/zh-TW.json`

- [ ] **Step 1: Add the English string**

In `apps/web/src/i18n/locales/en.json`, find the top-level object and insert:

```json
"more": "More",
```

Place it alphabetically or near `"dismiss"`. Be sure to keep the JSON valid (trailing commas matter).

- [ ] **Step 2: Add the Traditional Chinese string**

In `apps/web/src/i18n/locales/zh-TW.json`, insert the parallel entry:

```json
"more": "更多",
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('apps/web/src/i18n/locales/zh-TW.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/locales/en.json apps/web/src/i18n/locales/zh-TW.json
git commit -m "i18n(web): add 'more' label for overflow menu"
```

---

## Task 5: `OverflowMenu` component

**Files:**
- Create: `apps/web/src/ui/OverflowMenu.tsx`
- Create: `apps/web/tests/ui/OverflowMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/ui/OverflowMenu.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverflowMenu } from '../../src/ui/OverflowMenu';

test('opens on click, closes on outside click and Escape', async () => {
  const user = userEvent.setup();
  render(
    <div>
      <OverflowMenu>
        <button>Child A</button>
        <button>Child B</button>
      </OverflowMenu>
      <div data-testid="outside">outside</div>
    </div>,
  );

  // closed initially
  expect(screen.queryByText('Child A')).not.toBeInTheDocument();

  // opens on trigger click
  await user.click(screen.getByRole('button', { name: /more/i }));
  expect(screen.getByText('Child A')).toBeVisible();
  expect(screen.getByText('Child B')).toBeVisible();

  // Escape closes
  await user.keyboard('{Escape}');
  expect(screen.queryByText('Child A')).not.toBeInTheDocument();

  // reopen, then outside click closes
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByTestId('outside'));
  expect(screen.queryByText('Child A')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `pnpm --filter web test tests/ui/OverflowMenu.test.tsx`
Expected: fail with `Cannot find module '../../src/ui/OverflowMenu'`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/ui/OverflowMenu.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconDotsHorizontal } from './icons';

interface Props {
  children: ReactNode;
  className?: string;
}

export function OverflowMenu({ children, className }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        className="btn-icon"
        aria-label={t('more')}
        title={t('more')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <IconDotsHorizontal />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 flex w-52 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-pop"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm --filter web test tests/ui/OverflowMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/OverflowMenu.tsx apps/web/tests/ui/OverflowMenu.test.tsx
git commit -m "feat(web): add OverflowMenu component with outside-click + Escape"
```

---

## Task 6: `AppHeader` — split inline vs. overflow buttons

**Files:**
- Modify: `apps/web/src/ui/AppHeader.tsx:223-263`
- Create: `apps/web/tests/ui/AppHeader.overflow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/ui/AppHeader.overflow.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec('X'), fileHandle: null, dirty: false });
});

test('overflow menu groups secondary actions and uses Tailwind responsive classes', async () => {
  const user = userEvent.setup();
  render(<AppHeader />);

  // Inline buttons that MUST always be directly in the toolbar, regardless of width
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Run all/i })).toBeInTheDocument();

  // Secondary buttons are rendered inline at lg+ with hidden-below class, AND
  // mirrored inside the overflow menu with hidden-above class. Open the menu
  // and assert the mirrored versions exist.
  await user.click(screen.getByRole('button', { name: /more/i }));

  // Inside the menu the secondary labels are reachable by role=menuitem or text.
  expect(screen.getByRole('menu')).toHaveTextContent('Import OpenAPI');
  expect(screen.getByRole('menu')).toHaveTextContent('Compare');
  expect(screen.getByRole('menu')).toHaveTextContent('New');
  expect(screen.getByRole('menu')).toHaveTextContent('Open');

  // Trigger an item from the overflow menu and verify its handler fires. We
  // use "New" because its side effect (spec name reset to Untitled API) is
  // simple to observe.
  await user.click(screen.getByRole('menuitem', { name: /^New$/ }));
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `pnpm --filter web test tests/ui/AppHeader.overflow.test.tsx`
Expected: fail — the overflow menu and `role="menuitem"` entries do not yet exist in `AppHeader`.

- [ ] **Step 3: Update AppHeader**

In `apps/web/src/ui/AppHeader.tsx`:

1. Add exactly one new import near the existing `./icons` line (do not change the icons import):
   ```tsx
   import { OverflowMenu } from './OverflowMenu';
   ```

2. In the read-mode name button (`AppHeader.tsx:204-211`), add `truncate max-w-[200px]` to `className`. After:
   ```tsx
   className="rounded px-0.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-brand-600 truncate max-w-[200px]"
   ```

3. Replace the block of buttons (current lines ~223-252, starting at `<button className="btn" onClick={() => void newSpec()}>` and ending just before the lang-toggle divider) with:

   ```tsx
   {/* Inline on lg+, collapsed into overflow menu on md */}
   <button className="btn hidden lg:inline-flex" onClick={() => void newSpec()}>
     <IconFile />
     {t('new')}
   </button>
   <button className="btn hidden lg:inline-flex" onClick={() => void openSpec()}>
     <IconFolder />
     {t('open')}
   </button>
   <button className="btn hidden lg:inline-flex" onClick={() => void importOpenApi()}>
     <IconUpload />
     {t('importOpenApi')}
   </button>
   <button className="btn hidden lg:inline-flex" onClick={() => void compareSpec()}>
     {t('compare')}
   </button>
   {dirty && (
     <button className="btn hidden lg:inline-flex" onClick={() => void onDiscard()}>
       <IconX />
       {t('discardDraft')}
     </button>
   )}
   <button className="btn-primary" onClick={() => void saveSpec()}>
     <IconSave />
     {t('save')}
   </button>
   <div className="hidden lg:block">
     <ExportMenu />
   </div>
   <button className="btn" onClick={() => setBatchOpen(true)}>
     <IconPlay />
     {t('runAll')}
   </button>
   <div className="lg:hidden">
     <OverflowMenu>
       <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void newSpec()}>
         <IconFile />
         {t('new')}
       </button>
       <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void openSpec()}>
         <IconFolder />
         {t('open')}
       </button>
       <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void importOpenApi()}>
         <IconUpload />
         {t('importOpenApi')}
       </button>
       <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void compareSpec()}>
         {t('compare')}
       </button>
       {dirty && (
         <button role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => void onDiscard()}>
           <IconX />
           {t('discardDraft')}
         </button>
       )}
       <div className="mx-1 my-1 border-t border-slate-100" />
       <ExportMenu />
     </OverflowMenu>
   </div>
   ```

   The existing divider + lang-toggle button immediately below this block is unchanged.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter web test tests/ui/AppHeader.overflow.test.tsx`

Expected: PASS.

Note: this test does not simulate a narrow viewport — it asserts that secondary actions are *also* available via the overflow menu DOM, regardless of CSS. The Tailwind `hidden lg:inline-flex` / `lg:hidden` classes handle the visual switch, which is validated separately by the E2E test in Task 8.

- [ ] **Step 5: Run the full web test suite to catch regressions**

Run: `pnpm --filter web test`

Expected: all tests pass. If `tests/ui/AppHeader.test.tsx` or other AppHeader tests fail because `New` is now reached via overflow on narrow screens, it means the test was relying on the old single-instance selector. The existing AppHeader tests use `getByRole('button', { name: 'New' })` which still works because **the inline `New` button still exists** (it is only `hidden lg:inline-flex`, not unmounted). The overflow mirror adds a second `role=menuitem` — which is a different role and won't match `getByRole('button', ...)`. So these tests should not break. If they do, read the error and adjust the test selector (e.g., use the inline button by class or nearest-parent query).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/AppHeader.tsx apps/web/tests/ui/AppHeader.overflow.test.tsx
git commit -m "feat(web): condense AppHeader into overflow menu below lg"
```

---

## Task 7: Settings pane overlay below 1200px

**Files:**
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/tests/ui/App.overlaySettings.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/ui/App.overlaySettings.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/App';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { setUiPref } from '../../src/state/uiPrefs';

type Listener = (e: MediaQueryListEvent) => void;

function installMatchMedia(wide: boolean) {
  const byQuery = new Map<string, { matches: boolean; listeners: Set<Listener> }>();
  (window as any).matchMedia = (q: string) => {
    let entry = byQuery.get(q);
    if (!entry) {
      const matches = q.includes('1200') ? wide : false;
      entry = { matches, listeners: new Set() };
      byQuery.set(q, entry);
    }
    const current = entry;
    return {
      get matches() { return current.matches; },
      media: q,
      onchange: null,
      addEventListener: (_: string, cb: Listener) => { current.listeners.add(cb); },
      removeEventListener: (_: string, cb: Listener) => { current.listeners.delete(cb); },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };
  return {
    setWide(next: boolean) {
      for (const [q, entry] of byQuery) {
        const shouldMatch = q.includes('1200') ? next : entry.matches;
        if (shouldMatch !== entry.matches) {
          entry.matches = shouldMatch;
          entry.listeners.forEach((l) => l({ matches: shouldMatch } as MediaQueryListEvent));
        }
      }
    },
  };
}

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec('T'), fileHandle: null, dirty: false });
  setUiPref('sidebarCollapsed', false);
});

test('narrow viewport: settings renders as rail; expanding shows overlay with backdrop', async () => {
  const ctrl = installMatchMedia(false);
  const user = userEvent.setup();
  render(<App />);

  // Rail is the "Expand environment" button (label comes from CollapsedRail's aria-label)
  const rail = screen.getByRole('button', { name: /Expand Environment|Expand 環境/i });
  expect(rail).toBeInTheDocument();
  // Pinned settings heading should NOT be visible (collapsed rail only)
  expect(screen.queryByRole('heading', { name: /^Settings$|^設定$/ })).not.toBeInTheDocument();

  await user.click(rail);
  // Overlay shows settings heading
  expect(screen.getByRole('heading', { name: /^Settings$|^設定$/ })).toBeVisible();

  // Escape closes the overlay
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('heading', { name: /^Settings$|^設定$/ })).not.toBeInTheDocument();

  // Widening to 1200+ pins the settings pane automatically (no click needed)
  act(() => ctrl.setWide(true));
  expect(screen.getByRole('heading', { name: /^Settings$|^設定$/ })).toBeVisible();
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `pnpm --filter web test tests/ui/App.overlaySettings.test.tsx`
Expected: fail (today `App.tsx` renders a rail only when `sidebarCollapsed === true`, not based on viewport).

- [ ] **Step 3: Rewrite `App.tsx` to use the breakpoint**

Replace the body of `App.tsx`'s return statement with:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { EndpointList } from './ui/EndpointList';
import { EndpointEditor } from './ui/EndpointEditor';
import { EnvEditor } from './ui/EnvEditor';
import { AuthEditor } from './ui/AuthEditor';
import { SpecInfoEditor } from './ui/SpecInfoEditor';
import { useSpecStore } from './state/store';
import { IconChevronRight, IconFile, IconGlobe, IconLock, IconPanelRight } from './ui/icons';
import { setUiPref, useUiPrefs } from './state/uiPrefs';
import { CollapsedRail } from './ui/CollapsedRail';
import { useBreakpoint } from './hooks/useBreakpoint';

export function App() {
  const { t } = useTranslation();
  const { spec, setSpec, restoreDraft } = useSpecStore();
  const { sidebarCollapsed } = useUiPrefs();
  const isWide = useBreakpoint('(min-width: 1200px)');
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => { void restoreDraft(); }, [restoreDraft]);

  useEffect(() => {
    if (!overlayOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOverlayOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen]);

  // When viewport transitions wide, auto-dismiss any open narrow overlay so
  // the pinned pane takes over cleanly.
  useEffect(() => { if (isWide) setOverlayOpen(false); }, [isWide]);

  const pinned = isWide && !sidebarCollapsed;
  const showRail = !pinned;

  const settingsBody = (
    <div className="flex flex-col gap-3 p-3">
      <section className="card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <IconFile className="text-slate-500" />
          <h2 className="panel-title">{t('apiInfo')}</h2>
        </div>
        <SpecInfoEditor />
      </section>
      <section className="card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <IconGlobe className="text-slate-500" />
          <h2 className="panel-title">{t('environment')}</h2>
        </div>
        <EnvEditor />
      </section>
      <section className="card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <IconLock className="text-slate-500" />
          <h2 className="panel-title">{t('defaultAuth')}</h2>
        </div>
        <AuthEditor
          value={spec.auth}
          onChange={(auth) => void setSpec({ ...spec, auth })}
        />
        <label className="mt-3 flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={spec.useProxyDefault}
            onChange={(e) => void setSpec({ ...spec, useProxyDefault: e.target.checked })}
          />
          {t('useProxyDefault')}
        </label>
      </section>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <AppHeader />
      <div className="relative flex flex-1 overflow-hidden">
        <TypePanel />
        <EndpointList />
        <EndpointEditor />

        {pinned && (
          <aside className="thin-scroll flex w-80 flex-col overflow-y-auto border-l border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
              <h2 className="panel-title">{t('settings')}</h2>
              <button
                className="btn-icon"
                aria-label="Collapse sidebar"
                title={t('collapse')}
                onClick={() => setUiPref('sidebarCollapsed', true)}
              >
                <IconChevronRight />
              </button>
            </div>
            {settingsBody}
          </aside>
        )}

        {showRail && (
          <CollapsedRail
            label={t('environment')}
            icon={<IconPanelRight />}
            side="right"
            onExpand={() => {
              if (isWide) setUiPref('sidebarCollapsed', false);
              else setOverlayOpen(true);
            }}
          />
        )}

        {!isWide && overlayOpen && (
          <>
            <div
              className="absolute inset-0 z-20 bg-slate-900/10"
              onClick={() => setOverlayOpen(false)}
              aria-hidden="true"
            />
            <aside
              role="dialog"
              aria-label={t('settings')}
              className="thin-scroll absolute right-10 top-0 bottom-0 z-30 flex w-80 flex-col overflow-y-auto rounded-l-lg border-y border-l border-slate-200 bg-slate-50 shadow-pop"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
                <h2 className="panel-title">{t('settings')}</h2>
                <button
                  className="btn-icon"
                  aria-label="Collapse sidebar"
                  title={t('collapse')}
                  onClick={() => setOverlayOpen(false)}
                >
                  <IconChevronRight />
                </button>
              </div>
              {settingsBody}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
```

Notes for the engineer:
- `pinned` means viewport is ≥1200px AND the user has not manually collapsed the pane (existing pref behavior).
- On narrow viewports, `sidebarCollapsed` is effectively ignored — the pane is always the rail + opt-in overlay.
- `overlayOpen` state is intentionally not persisted.

- [ ] **Step 4: Run the overlay test**

Run: `pnpm --filter web test tests/ui/App.overlaySettings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full web test suite**

Run: `pnpm --filter web test`
Expected: all tests pass. If any existing test that rendered `<App />` expected the settings pane to be pinned at default viewport, it may now fail because jsdom's default `matchMedia` returns `matches=false`. In that case, either update the test to install the matchMedia mock (pattern shown in Step 1 of this task) or narrow the assertion to elements outside the settings pane. Read the failure message and adapt — don't paper over unrelated regressions.

- [ ] **Step 6: Manual sanity check**

Run: `pnpm --filter web dev`

In a browser:
- 1440×900: settings pinned on right, collapse chevron works as before.
- 1100×800: rail on right by default; click to open overlay; Esc closes; backdrop click closes; resize wider to 1400 — overlay auto-closes, pinned pane appears.
- 900×800: same as 1100 case.

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx apps/web/tests/ui/App.overlaySettings.test.tsx
git commit -m "feat(web): overlay settings pane below 1200px"
```

---

## Task 8: Playwright responsive smoke

**Files:**
- Create: `apps/web/e2e/responsive.spec.ts`

- [ ] **Step 1: Write the E2E spec**

Create `apps/web/e2e/responsive.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('responsive layout', () => {
  test('at 900×800: overflow menu exposes Import/Compare; settings is a rail + overlay', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    // Inline buttons at this width: Save, Run all, lang toggle
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run all/i })).toBeVisible();

    // Secondary buttons live in the overflow menu
    await page.getByRole('button', { name: /more/i }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('Import OpenAPI')).toBeVisible();
    await expect(menu.getByText('Compare')).toBeVisible();
    await page.keyboard.press('Escape');

    // Right rail present, pinned settings absent
    const envRail = page.getByRole('button', { name: /Expand Environment/i });
    await expect(envRail).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

    // Click rail → overlay appears → Escape closes
    await envRail.click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
  });

  test('at 1440×900: all header buttons inline; settings pane pinned', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Import OpenAPI' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare' })).toBeVisible();
    await expect(page.getByRole('button', { name: /more/i })).toHaveCount(0);

    // Settings heading is in the pinned aside
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the E2E spec**

Run: `pnpm --filter web exec playwright test e2e/responsive.spec.ts --reporter=list`

Expected: both tests pass. If the runner complains about browsers, run `pnpm --filter web exec playwright install chromium` first (one-time).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/responsive.spec.ts
git commit -m "test(web): e2e responsive smoke at 900 and 1440"
```

---

## Task 9: Full build + test sweep

**Files:** none — this is a verification step.

- [ ] **Step 1: Type-check**

Run: `pnpm --filter web lint`
Expected: no TS errors.

- [ ] **Step 2: Vitest**

Run: `pnpm --filter web test`
Expected: all pass.

- [ ] **Step 3: Build**

Run: `pnpm --filter web build`
Expected: succeeds, produces `apps/web/dist/`.

- [ ] **Step 4: Full E2E**

Run: `pnpm --filter web e2e`
Expected: all pass (smoke + responsive + any existing).

- [ ] **Step 5: Commit any ancillary fixes**

If any of the above produced fixes (e.g., fixing a flaky test selector that surfaced during the sweep), commit them now with a descriptive message. If not, skip.

---

## Task 10: Refresh docs screenshots

**Files:** `apps/docs/public/screenshots/` (regenerated by the script; no manual edits).

Per the rule in [docs/rules/](../../rules/) and user memory: `apps/web` UI changed, so docs screenshots must be refreshed before any docs release.

- [ ] **Step 1: Regenerate screenshots**

Run: `SCREENSHOTS=1 pnpm --filter web e2e:screenshots`
Expected: captures in `apps/docs/public/screenshots/**` updated.

- [ ] **Step 2: Inspect the diff**

Run: `git status apps/docs/public/screenshots`
Run: `git diff --stat apps/docs/public/screenshots` (byte-size diffs only — images are binary)

If screenshots materially changed (e.g., header now has overflow icon at the capture width), that's expected. Spot-check one or two images by opening them to confirm the layout still matches the tutorial prose around them.

The capture script uses 1600×1000 (`apps/web/e2e/docs-screenshots-extras.spec.ts:46`), so the overflow menu should NOT appear — we are at `xl+` there. If it does appear, the test-viewport constant is too small for the new breakpoint; widen it to 1440 or above and re-run.

- [ ] **Step 3: Commit the refreshed screenshots**

```bash
git add apps/docs/public/screenshots
git commit -m "docs: refresh screenshots after RWD changes"
```

If no material diff, skip the commit.

---

## Task 11: Final polish + PR

**Files:** none inside the repo — this task does bookkeeping.

- [ ] **Step 1: Move spec and plan to `done/`**

Inside the worktree:

```bash
git mv docs/specs/active/2026-04-20-responsive-layout.md docs/specs/done/2026-04-20-responsive-layout.md
git mv docs/plans/active/2026-04-20-responsive-layout.md docs/plans/done/2026-04-20-responsive-layout.md
```

- [ ] **Step 2: Tick the checkbox in `docs/TODO.md`**

In `docs/TODO.md:10`, change:

```md
- [ ] Responsive layout (RWD) — app breaks at narrow/tablet widths...
```

to:

```md
- [x] Responsive layout (RWD) — see `docs/plans/done/2026-04-20-responsive-layout.md`.
```

Also update the "Last updated:" date at the top of the file to `2026-04-20`.

- [ ] **Step 3: Commit the bookkeeping**

```bash
git add docs/specs docs/plans docs/TODO.md
git commit -m "docs: ship RWD plan — move spec/plan to done, tick TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push branch and open PR**

```bash
git push -u origin plan/responsive-layout
gh pr create --title "RWD: responsive layout for apps/web at 768–1279px" --body "$(cat <<'EOF'
## Summary

- Clamp the layout viewport to 768 CSS pixels (meta + CSS). Phones horizontally scroll the tablet layout; no mobile redesign.
- Header: Save / Run all / lang toggle stay inline; the other six actions collapse into a new `OverflowMenu` below `lg` (1024px).
- Right settings pane: rail + floating overlay below 1200px; pinned at ≥1200px (unchanged today's behavior).
- New: `useBreakpoint` hook, `OverflowMenu` component, `IconDotsHorizontal`, `more` i18n key (en + zh-TW), responsive E2E spec.

## Test plan

- [x] `pnpm --filter web lint`
- [x] `pnpm --filter web test`
- [x] `pnpm --filter web build`
- [x] `pnpm --filter web e2e`
- [x] Manual check at 375/768/900/1100/1440 widths
- [x] Docs screenshots regenerated (capture viewport 1600 is ≥xl, so overflow menu not captured)

Spec: `docs/specs/done/2026-04-20-responsive-layout.md`
Plan: `docs/plans/done/2026-04-20-responsive-layout.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Do NOT fast-forward merge to `main`.** Per user memory, pushing to `main` triggers a Cloudflare Pages deploy and always requires explicit user approval. The branch push + PR creation above is fine; merging is the user's call.

- [ ] **Step 5: Report the PR URL to the user and stop**

Print the PR URL returned by `gh pr create`. Do not merge. Do not push to `main`.

---

## Appendix: Rollback plan

If something in this plan goes sideways and the user wants to revert, every task ends with its own commit. Roll back individual tasks by reverting the corresponding commit:

```bash
git log --oneline plan/responsive-layout
git revert <commit-hash>
```

The new files (`hooks/useBreakpoint.ts`, `ui/OverflowMenu.tsx`, test files, `e2e/responsive.spec.ts`) can be deleted wholesale if the entire effort needs to be dropped — they are not imported by anything outside this plan.
