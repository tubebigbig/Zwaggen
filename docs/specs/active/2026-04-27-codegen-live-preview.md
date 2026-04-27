# Spec — Live codegen preview panel (Slice 2B)

## Problem

After Slice 2A, users can export a single endpoint, type, or folder via the new ExportPopover — but to see what the *whole spec*'s codegen looks like, they have to either: (a) run `zwag generate ts <spec>` in a terminal and reload generated files, or (b) export 5+ folders one at a time. Neither closes the "edit the spec, watch the codegen update" feedback loop the live web tool is supposed to enable.

This slice adds a side panel that shows the generated TS / Zod / Client / OpenAPI for the **entire** current spec, debounced as the spec changes. Same codegen functions as the export popover; same Copy + Download UI. No CLI required.

## Success criteria

- New toggle button in `AppHeader` (after the existing Export menu, before Run All). Icon: `IconPanelRight`. Label: existing i18n key `livePreview` ("Live preview" / "即時預覽" — added but unused in Slice 2A).
- Toggling the button persists `livePreviewOpen` in `uiPrefs` (localStorage), survives reload.
- When `livePreviewOpen` is true AND viewport is ≥1200px, the panel renders to the LEFT of the existing Settings sidebar so both can be open simultaneously.
- Below 1200px the panel does NOT render (the toggle still works as a state setter, but layout would be too cramped).
- Panel header: title (`t('livePreview')`) + close X button (mirrors the Settings sidebar's collapse button shape).
- 4 tabs: TS / Zod / Client / OpenAPI. The active tab persists in component-local state (resets on remount; not in `uiPrefs`).
- Each tab body: read-only `<pre>` of the generated output + Copy button + Download button. Pattern mirrors `ExportPopover.Pane` (intentional duplication; ~50 lines each, both are likely to evolve).
- Output computes via `generateTs(spec)` / `generateZod(spec)` / `generateClient(spec)` / `JSON.stringify(toOpenApi(spec), null, 2)` — full spec, no `{ only }` filter.
- Updates debounced 300ms after the spec stops changing. New `useDebounce<T>(value, ms)` hook (~5 lines). Avoids re-running codegen on every keystroke during rapid edits.
- Each codegen call wrapped in try/catch. If codegen throws (illegal file types, type-key collisions, etc.), the pane body shows a friendly error message (`t('livePreviewError') + err.message`) instead of crashing the panel.
- Tests:
  - Panel renders 4 tabs and the default tab (TS) shows TS output for a fixture spec.
  - Switching tabs swaps the output.
  - After spec changes, the output updates (after debounce).
  - Codegen throw → pane body shows the error message, panel doesn't crash.
  - AppHeader toggle button toggles `uiPrefs.livePreviewOpen`.
  - Below 1200px the panel doesn't mount even when `livePreviewOpen` is true.
- TODO entry ticked: "Live codegen preview in the web app" line in `docs/TODO.md` flips to `[x]`.

## Out of scope

- **Per-tab lazy compute** (only run the active tab's generator). v1 runs all 4 on every debounced recompute. Acceptable for typical specs; revisit if perf complaints arrive.
- **Full collapse-to-rail behavior** matching the Settings sidebar's `CollapsedRail` pattern. Slice 2B's panel is binary (open / closed) via the AppHeader button. Adding a rail-mode adds another ~20 lines + styling and isn't asked for.
- **Editable preview** — the panel is read-only. Editing happens in the spec.
- **In-browser formatting** (eslint/prettier). Same reasoning as Slice 2A — Node-only deps, deferred.
- **Per-spec preferences** for the active tab — the active tab is component-local and resets on remount. Persisting it to `uiPrefs` is overkill for a side affordance.
- **Multi-pane / split-screen view** comparing two outputs simultaneously. v1 is a single tab at a time.
- **Auto-open after first spec creation** or any onboarding behavior. The button is discoverable; no auto-popup.
- **Keyboard shortcut** to toggle the panel (e.g., Cmd-Shift-P). Add later if asked.

## Approach

### `uiPrefs.livePreviewOpen`

Add to `apps/web/src/state/uiPrefs.ts`:
- Type: `livePreviewOpen: boolean`
- Default: `false`
- Mirrors `sidebarCollapsed` and `endpointsCollapsed` shape exactly.

### AppHeader toggle button

Insert after the existing `<ExportMenu>` and before "Run All". Use `setUiPref('livePreviewOpen', !livePreviewOpen)`. Active state styling: when open, apply a subtle ring/highlight (mirror existing patterns — likely a `bg-slate-100` or `text-brand-600` swap when active).

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

`aria-pressed` is the canonical attribute for toggle buttons. Confirm no other right-panel toggle in AppHeader uses a different convention; if so, match it.

### `<LivePreviewPanel>` component

New file `apps/web/src/ui/LivePreviewPanel.tsx`. Sketch:

```tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { setUiPref } from '../state/uiPrefs';
import { useDebounce } from '../hooks/useDebounce';
import { generateTs, generateZod, generateClient, toOpenApi } from '@zwaggen/core';
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
        <button
          className="btn-icon"
          aria-label={t('close')}
          onClick={() => setUiPref('livePreviewOpen', false)}
        >
          <IconX />
        </button>
      </header>
      <div role="tablist" className="flex gap-1 border-b border-slate-200 px-2 py-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === active?.id}
            onClick={() => setActiveId(tab.id)}
            className={`rounded px-2 py-1 text-xs ${tab.id === active?.id ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active && <PreviewPane key={active.id} tab={active} />}
    </aside>
  );
}

function PreviewPane({ tab }: { tab: PreviewTab }) {
  // Same shape as ExportPopover.Pane: Copy / Download / <pre>. Duplicated, not extracted.
  // ...
}

function buildPreviewTabs(spec, t): PreviewTab[] {
  const safe = (label, filename, fn) => {
    try {
      return { id: filename, label, output: fn(), filename, isError: false };
    } catch (err) {
      return { id: filename, label, output: `${t('livePreviewError')}\n\n${err instanceof Error ? err.message : String(err)}`, filename, isError: true };
    }
  };
  return [
    safe(t('exportTabTypes'),   'types.ts',     () => generateTs(spec)),
    safe(t('exportTabSchemas'), 'schemas.ts',   () => generateZod(spec)),
    safe(t('exportTabClient'),  'client.ts',    () => generateClient(spec)),
    safe(t('exportTabOpenApi'), 'openapi.json', () => JSON.stringify(toOpenApi(spec), null, 2)),
  ];
}
```

### `useDebounce` hook

New file `apps/web/src/hooks/useDebounce.ts`:

```ts
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

Generic enough to live alongside `useBreakpoint`.

### App.tsx layout integration

Add to the right-side flex chain in `App.tsx`:

```tsx
const { sidebarCollapsed, livePreviewOpen } = useUiPrefs();
// ...
{livePreviewOpen && isWide && <LivePreviewPanel />}
{pinned && (
  <aside className="...">{/* existing Settings */}</aside>
)}
```

The `LivePreviewPanel` slots into the same flex container, just before the Settings sidebar. Below 1200px (`!isWide`), it doesn't render — matching the design out-of-scope decision.

### i18n strings

Add to `en.json`:
- `livePreviewError`: "Codegen failed:" — short prefix; the actual error message follows.
- `close`: probably already exists (the LoadErrorModal uses `t('dismiss')` instead, but `close` is more natural for a panel). Verify; reuse existing if already present.

zh-TW:
- `livePreviewError`: "程式碼產生失敗："
- `close`: as needed.

### Tests

`apps/web/tests/ui/LivePreviewPanel.test.tsx`:
- Renders 4 tabs.
- Default tab (types.ts) shows non-empty TS for a fixture spec.
- Click `schemas.ts` tab → output contains `Schema`.
- Spec change → after 300ms (use `vi.useFakeTimers` or wait), output reflects new spec.
- Codegen-throw test: seed a spec with illegal file type or type collision; assert the pane body contains the error key prefix + message.

`apps/web/tests/ui/AppHeader.livePreview.test.tsx`:
- Toggle button toggles `uiPrefs.livePreviewOpen`.
- Button has `aria-pressed={livePreviewOpen}` reflecting state.

### Risks

- **Debounce + fake timers + React Testing Library** is famously tricky. If the test fails because `act` warnings or timers don't fire, fall back to either (a) reading from a hook with timer mocked, or (b) testing the debounce in isolation as a pure hook test, separate from the panel render test.
- **Codegen call cost** for very large specs — running all 4 generators on every settled spec change. Will revisit if a user complains; the debounce makes this manageable.
- **Layout below 1200px** — the toggle still flips state but the panel doesn't render. Risk: confusing user. Mitigation: add a `title` on the AppHeader button that hints at "available in wide layouts" only when below the breakpoint. Optional polish; can ship without it.
- **Component-local active tab state** — switching the panel off and back on resets the active tab to TS. If a user switches to OpenAPI, closes, and re-opens, the panel shows TS again. Acceptable for v1; persisting per-tab in `uiPrefs` is over-engineering for this affordance.

## Done definition

- AppHeader has the new toggle button.
- `LivePreviewPanel` renders 4 tabs with debounced codegen output.
- Errors caught + displayed in-pane.
- Layout coexists with the Settings sidebar above 1200px.
- All tests + lint green.
- TODO entry "Live codegen preview" ticked.
- Spec + plan moved to `done/`.
- Branch `plan/codegen-live-preview` pushed.
