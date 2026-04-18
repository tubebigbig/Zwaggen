# Spec — Fix AppHeader backdrop-blur dialog trap

## Problem

`apps/web/src/ui/AppHeader.tsx:170` sets `backdrop-blur` on the outer `<header>`:

```tsx
<header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
```

The two in-header dialogs are rendered as children of this header:

```tsx
{batchOpen && <BatchRunPanel spec={spec} onClose={() => setBatchOpen(false)} />}
{diffBase && <DiffPanel base={diffBase} current={spec} onClose={() => setDiffBase(null)} />}
```

Both dialogs apply `fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4` to their root (`DiffPanel.tsx:22`, `BatchRunPanel.tsx:56`). Per CSS spec, any element with `backdrop-filter` other than `none` creates a **containing block for fixed-positioned descendants** (same rule as `transform`/`filter`/`will-change`). That means `fixed inset-0` no longer means "the viewport" — it means "the nearest containing block", which is the header row itself. The dialogs render trapped inside the header's ~48px tall strip, overflowing only partially into the page below.

Observable symptom: opening "Run all" or "Compare" shows a sliver of the dialog pinned to the header area rather than a full-viewport modal overlay.

## Success criteria

- Clicking "Run all" opens `BatchRunPanel` centered over the entire viewport with the expected dim backdrop covering the whole page (not clipped to the header strip).
- Clicking "Compare" (once a base spec is loaded) opens `DiffPanel` the same way.
- The header's own visual design is unchanged: still sticky, still has the semi-transparent white background. The frosted-glass blur effect is preserved *or* replaced with a visually equivalent treatment the user won't notice.
- Existing tests for `AppHeader`, `DiffPanel`, `BatchRunPanel` still pass.
- No visual regression in other dialog-like overlays (e.g., `TypePanel` uses `absolute` inside an ancestor, not `fixed` — unaffected).

## Out of scope

- Any broader portal infrastructure (e.g., a `<Modal>` component, focus-trap utilities).
- RWD fixes for the header row itself.
- Other `backdrop-blur` usages elsewhere in the app (if any).

## Approach

Two options:

1. **Remove `backdrop-blur` from the header.** Keep `bg-white/95` (and drop the `supports-[backdrop-filter]:bg-white/75` line since there's no longer a backdrop filter). Simplest, smallest diff, zero new infrastructure. Cost: the header loses its frosted-glass look — but on the current design, the content behind the header is the brand-colored main surface and scrollable panes, and at 95% opacity white the blur is barely perceptible. Acceptable loss.

2. **Portal the two dialogs to `document.body` via `createPortal`.** Preserves the blur. Cost: new portal pattern (no other portal usage in the codebase per survey), test files may need to render with a portal-aware setup, and the dialogs' close-on-backdrop-click / Esc handling stays intact because they use `fixed inset-0` which now genuinely sits on top of the viewport.

**Decision: Option 1 (remove `backdrop-blur` from the header).** The frosted look is a nice-to-have; the dialogs being fully functional overlays is a must-have. Minimal diff, no new abstractions, no test plumbing for portals, and the header already has a solid `bg-white/95` that looks fine without the blur. If the team later decides the blur is essential, switch to Option 2 then. A comment is not required — the cause is documented here and in the plan.

Note: the `supports-[backdrop-filter]:bg-white/75` utility has no effect once `backdrop-blur` is gone (no backdrop-filter → the `@supports` rule never matches), but it's also harmless. Drop it for tidiness.
