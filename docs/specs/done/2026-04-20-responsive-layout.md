# Spec — Responsive layout (RWD)

**Status:** active
**Date:** 2026-04-20
**Scope:** `apps/web` only (`play.zwaggen.com`). Tutorial docs (`apps/docs`) are already responsive via VitePress.

## Goal

Make the playground's layout coherent at tablet widths (768–1279px): the header must not overflow, the three-pane workspace must not crowd the editor, and dialogs must not clip. Below 768px the app shows the same layout (no mobile redesign) but enforces a 768-CSS-pixel minimum viewport — phones render the tablet layout and scroll horizontally.

## Motivation

Today the app is tuned for ≥1280px:

- `AppHeader` packs 9 buttons + name editor + lang toggle into a single non-wrapping `flex` row. Below ~1100px the trailing buttons run off-screen.
- `App.tsx` lays out three fixed-width siblings (`TypePanel` rail `w-10`, `EndpointList` `w-64`, `EndpointEditor` fluid, settings `w-80`). At 768px the editor gets ~344px, which is cramped once `EndpointEditor`'s own padding/labels are accounted for.
- No viewport clamp — on a 375-pixel phone the layout tries to compress into 375px and produces overlapping chips, clipped buttons, and an unusable editor.

The TODO describes this as: *"app breaks at narrow/tablet widths (header row overflows off-screen, side panels crowd). Needs a systematic pass across `AppHeader`, the three-pane layout, and dialog positioning."*

## Non-goals

- Mobile-specific layout (single-pane stack, drawer nav, swipe gestures). Phones get the tablet layout scaled/scrolled, not a rewrite.
- Dialog changes — `BatchRunPanel`, `DiffPanel`, import-warning alert already use `fixed inset-0 p-4` + `w-full max-w-* max-h-[90vh]` and center correctly at 768px+. The old `backdrop-blur` containing-block bug was fixed separately (`docs/plans/done/2026-04-19-appheader-backdrop-blur.md`).
- `EndpointEditor` internals — it already uses `mx-auto max-w-4xl` and flex-wraps internal rows; no changes needed.
- Persisting a per-user "force desktop layout" override. The breakpoint decision is purely viewport-driven.
- Touch affordances (larger tap targets, long-press menus, etc.).

## Breakpoints

Tailwind defaults, no custom breakpoints:

| Range | Name | Header | Settings |
|---|---|---|---|
| `<768px` | phone | Not targeted. Viewport clamp forces 768-px layout; user scrolls. | — |
| `md` 768–1023 | tablet | Overflow menu. | Overlay. |
| `lg` 1024–1199 | transitional | Inline (fits at 1024px). | Overlay. |
| `xl+` ≥1200 | desktop | Inline. | Pinned as today. |

Two distinct thresholds:

- Header condensation at `lg` (≥1024px, Tailwind default). Counting the button inventory at typical widths (≈80px per button × 6 grouped buttons + Save/Run/lang inline + logo/name ≈ 160px), the header comfortably fits inline at 1024px.
- Settings pinning at 1200px (custom matchMedia query). At 1024–1199px the fixed chrome (`10 + 256 + 320 = 586`) plus a usable editor column would crowd; overlay avoids this. The custom threshold is used because `xl` (1280) is too conservative and `lg` (1024) is too permissive.

## Viewport clamp

Two complementary mechanisms (belt and suspenders):

1. **Meta viewport** in `apps/web/index.html`:
   ```html
   <meta name="viewport" content="width=device-width, min-width=768, initial-scale=1.0">
   ```
   `min-width=768` is not universally honored by current mobile browsers, but it signals intent and is honored by any future or niche browser that supports it. Existing `initial-scale=1.0` preserved.

2. **CSS** on the root document:
   ```css
   html { min-width: 768px; }
   ```
   This is the actual enforcement. On a phone narrower than 768px the body becomes wider than the viewport and the user pans horizontally. No layout inside the page needs to know it is being viewed on a phone.

Placed in whichever global stylesheet the app already has; the repo uses Tailwind with a single entry CSS file — we add one rule there.

## 1. AppHeader — overflow menu

### Button inventory (today, left to right)

Always-visible:
1. Logo + name editor + dirty chip + (playground) chip
2. **New**
3. **Open**
4. **Import OpenAPI**
5. **Compare**
6. **Discard** (conditional on `dirty`)
7. **Save** (primary)
8. **Export** (`ExportMenu`, opens dropdown)
9. **Run all**
10. Divider
11. Lang toggle

### Grouping

Inline at all widths: logo/name/chips, **Save**, **Run all**, lang toggle.

Inline on `lg+` (≥1024px), collapsed on `md` (<1024px): **New**, **Open**, **Import OpenAPI**, **Compare**, **Discard**, **Export**.

Rationale: **Save** and **Run all** are the two highest-frequency actions and users expect them in a fixed position. Lang toggle is tiny. Everything else is lower-frequency or destructive — acceptable behind one more click.

### Overflow component

New `apps/web/src/ui/OverflowMenu.tsx`:

- A `⋯` (horizontal ellipsis) icon button, same visual weight as `btn-icon`.
- Click opens a dropdown anchored top-right, styled like the existing `ExportMenu` dropdown (`absolute right-0 mt-1.5 rounded-lg border shadow-pop`).
- Menu items mirror the header buttons one-for-one: same label (`t(...)`), same icon, same handler.
- **Export** collapses into the overflow menu *as a submenu* on `md`: clicking "Export" inside the overflow menu opens the normal `ExportMenu` popover underneath it. On `lg+`, `ExportMenu` renders standalone as today.
- **Discard** only appears when `dirty === true`, same as today.
- Closes on: outside click, Escape, item click.

Rendering rule, expressed with Tailwind utility classes so no JS breakpoint logic is needed inside AppHeader itself:

```tsx
<button className="btn hidden lg:inline-flex" onClick={...}>New</button>
...
<OverflowMenu className="lg:hidden">
  <OverflowMenuItem onClick={...} icon={<IconFile />}>New</OverflowMenuItem>
  ...
</OverflowMenu>
```

The duplication (items exist in both `lg:hidden` menu and `hidden lg:inline-flex` buttons) is accepted — it avoids a JS breakpoint check and keeps the markup readable. The button handlers can be shared via local functions.

### Name editor

The editor's `max-w-[320px]` already caps width, but long names can still collide with the dirty chip at narrow widths. Add `truncate` to the read-mode button (`<button>{spec.info.name}</button>`) so oversize names ellipsize when displayed, without affecting the edit mode. No other changes.

## 2. Three-pane layout — settings overlay

### Today

```tsx
<div className="relative flex flex-1 overflow-hidden">
  <TypePanel />             {/* rail + floating overlay on expand */}
  <EndpointList />          {/* w-64 */}
  <EndpointEditor />        {/* fluid */}
  {sidebarCollapsed ? <CollapsedRail .../> : <aside className="w-80">...</aside>}
</div>
```

`TypePanel` already uses the overlay pattern we want for settings: a collapsed rail (`w-10`) plus an absolute-positioned floating panel (`absolute left-10 top-0 bottom-0 z-30 ... shadow-pop`) with a backdrop, Escape-to-close, click-outside-to-close.

### Change

Below 1200px, the settings pane behaves the same way:

- Always render the collapsed rail (`CollapsedRail`) on the right edge.
- When user clicks to expand, render the settings panel as `absolute right-10 top-0 bottom-0 z-30` over the editor, with a backdrop behind it. The editor underneath keeps its full width — the panel floats on top.
- Escape and backdrop click dismiss.
- The persisted `sidebarCollapsed` pref only applies at ≥1200px (where pinned behavior is used).

Add a breakpoint hook:

```ts
// apps/web/src/hooks/useBreakpoint.ts
export function useBreakpoint(query: string): boolean {
  const mql = useMemo(() => window.matchMedia(query), [query]);
  const [matches, setMatches] = useState(mql.matches);
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mql]);
  return matches;
}
```

In `App.tsx`:

```tsx
const isWide = useBreakpoint('(min-width: 1200px)');
const { sidebarCollapsed } = useUiPrefs();
const [overlayOpen, setOverlayOpen] = useState(false);
const rightPinned = isWide && !sidebarCollapsed;
const rightRailShown = !rightPinned;
```

The existing `sidebarCollapsed` pref continues to work on `xl+` screens; overlay state is local-only and does not persist.

### TypePanel and EndpointList unchanged

`TypePanel`: already overlay-based. Works as-is at 768px+.

`EndpointList` (`w-64`, 256px): stays fixed and visible at all widths. Fixed chrome at 768px = 10 (TypePanel rail) + 256 (endpoint list) + 40 (settings rail) = 306 px, leaving 462 px for the editor. `EndpointEditor`'s internal `mx-auto max-w-4xl` plus existing `flex-wrap` rows accommodates this. Verified by reading `RunPanel.tsx:217-260` — the "Try it" toolbar already wraps and uses `min-w-[200px]` + `flex-1` for the URL input.

## 3. Dialogs

No changes planned. Explicit list of what we verified:

- `BatchRunPanel.tsx:52-58` — `fixed inset-0 p-4` outer; `w-full max-w-4xl max-h-[90vh]` inner. At 768px the dialog is 736px wide, at 900px it is 868px. Content table already has fixed column widths; fine.
- `DiffPanel.tsx:18-24` — same pattern, `max-w-3xl`. At 768px the dialog is 736px wide.
- Import-warning alert `AppHeader.tsx:267` — `mx-4 mb-2` margin; no width constraint; sits inside the header's sticky container which is now full-width responsive.
- `ExportMenu.tsx:27` — `absolute right-0 w-64`. Anchored to its trigger; fits inside the header at 768px.

If a dialog visually breaks during verification we will patch it inline as part of this work, but no up-front changes planned.

## Files touched

New:
- `apps/web/src/ui/OverflowMenu.tsx` — overflow-menu component.
- `apps/web/src/hooks/useBreakpoint.ts` — matchMedia wrapper.

Modified:
- `apps/web/index.html` — viewport meta.
- `apps/web/src/index.css` (or whichever is the single global CSS entry; confirm during implementation) — `html { min-width: 768px }`.
- `apps/web/src/ui/AppHeader.tsx` — split buttons into `hidden lg:inline-flex` + overflow menu.
- `apps/web/src/App.tsx` — use `useBreakpoint`; render settings as overlay below 1200px.
- `apps/web/src/ui/icons.tsx` — add an ellipsis (three-dot) icon if absent.
- `apps/web/src/i18n/en.json`, `apps/web/src/i18n/zh-TW.json` — add `more` label (e.g. "More" / "更多").

Potentially modified (confirm during implementation):
- `apps/web/src/state/uiPrefs.ts` — no schema change planned, but verify `sidebarCollapsed` semantics still match the new logic.

## Testing

Unit:
- `useBreakpoint.test.ts` — returns initial `matches`, updates on `MediaQueryListEvent`.

Component (Vitest + React Testing Library):
- `AppHeader.test.tsx` — at simulated `<1024px`, overflow menu is visible and contains {New, Open, Import, Compare, Export} items. At `≥1024px`, those buttons are rendered inline and overflow menu is hidden.
- `App.test.tsx` (or a focused settings-overlay test) — at simulated `<1200px`, right side is a rail by default; expanding renders the overlay with a backdrop; Escape closes.

E2E (Playwright):
- Add a responsive smoke spec `apps/web/e2e/responsive.spec.ts`:
  - At 900×800 viewport, load the app, confirm header fits one row, click overflow menu, click Import, confirm file dialog is triggered (or the relevant handler fired).
  - At 900×800, click the settings rail, confirm the overlay appears, press Escape, confirm it closes.
  - At 1440×900, confirm overflow menu is absent and settings pane is pinned.

Docs screenshots:
- Per `docs/rules/` memory rule: re-run `SCREENSHOTS=1 pnpm --filter web e2e:screenshots` before shipping, since apps/web UI has changed.
- No new docs pages are added for RWD; existing screenshots are all captured at 1600×1000 and remain valid.

## Acceptance criteria

1. On a 768×1024 viewport, every header button is reachable without horizontal scrolling, Save + Run all + lang toggle are still inline, and everything else is inside the `⋯` menu.
2. On a 900×800 viewport, the settings pane is collapsed to a rail by default; clicking it slides an overlay in from the right with a backdrop; Escape and backdrop-click close it.
3. On a 1440×900 viewport, behavior is identical to today (all header buttons inline, settings pinned unless manually collapsed).
4. On a 375×812 phone (iPhone 12 logical), the layout renders at 768-CSS-pixel minimum width with horizontal scroll; no element is clipped beyond the horizontal-scroll frame; `<meta name="viewport">` contains the configured `min-width=768` token.
5. All existing Vitest + Playwright suites pass (`pnpm --filter web test`, `pnpm --filter web e2e`).
6. Docs screenshots regenerated (per project rule) and visually match or are deliberately updated.
