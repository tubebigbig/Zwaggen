# Spec — Fix lang toggle button layout

## Problem

In the playground header (`apps/web/src/ui/AppHeader.tsx:254-262`), the language toggle button is broken when displaying "中文" (shown while current lang is English). The button is clipped, text overflows, and the button itself gets pushed off the visible header at typical desktop widths.

## Root cause

The button reuses the `.btn-icon` utility class defined in `apps/web/src/index.css`:

```css
.btn-icon {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-md
         border border-slate-200 bg-white text-slate-600 transition;
}
```

`btn-icon` hard-codes `w-7` (28px) because it is designed for icon-only square buttons. But the lang toggle puts both an icon AND a text label ("中文" / "EN") inside it, plus adds `px-2` horizontal padding on top. The fixed 28px width cannot fit the content — the inner content overflows, the text clips, and under `flex-shrink: 1` the button compresses to ~10px wide at the rendered box. This is the "breaks when showing 中文" symptom the user sees (CJK chars are wider per glyph than "EN", so "中文" clips visibly; "EN" may partially fit but is still cramped).

Verified via `preview_inspect`: computed width 28px, rendered boundingBox.width 10px, text "中文" clipped, positioned at x ≈ 872 on a 665-wide viewport (off-screen due to header row overflow).

## Success criteria

- Lang toggle button renders fully visible with its icon + label at every standard desktop width (≥1024px wide viewport).
- Both "中文" and "EN" labels fit inside the button without clipping and with consistent vertical alignment next to the globe icon.
- Button is not pushed off-screen by header overflow at 1280×800 desktop.
- No regression to the other `.btn-icon` call sites (icon-only buttons elsewhere in the UI).
- Visual weight of the button stays compact — it's a header utility control, not a primary action; keep it roughly the same height as neighboring `.btn` elements.

## Out of scope

- AppHeader overall responsive redesign (the header row overflowing at narrow widths is a pre-existing concern tracked elsewhere).
- Internationalisation content beyond this one button.
- `backdrop-blur` stacking context issue (TODO item #12, separate plan).

## Approach

Two reasonable options:

1. **Inline utility classes (preferred):** Remove the `btn-icon` class from this button and write the needed utilities directly, since this is a one-off "small pill with icon + label" that doesn't repeat elsewhere. Roughly: `inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700`.
2. **New compound class:** Add a `.btn-chip` (or similar) to `index.css` for text+icon small buttons and use it here. Only worth it if this pattern will be reused.

Decision: **Option 1.** No other button in the codebase currently follows this shape; premature abstraction. If a second instance appears, refactor to a class then.
