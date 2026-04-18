# Plan — Fix AppHeader backdrop-blur dialog trap

Spec: `docs/specs/active/2026-04-19-appheader-backdrop-blur.md`.

Execute on branch `plan/appheader-backdrop-blur` in `.worktrees/appheader-backdrop-blur`. All commits inside the worktree; never `cd` to the primary repo. One task commit + one archive commit.

## Tasks

### 1. Drop `backdrop-blur` from the header

**File:** `apps/web/src/ui/AppHeader.tsx` line 170.

Change:

```tsx
<header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
```

to:

```tsx
<header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95">
```

That is: remove `backdrop-blur` and `supports-[backdrop-filter]:bg-white/75`. Keep the sticky/z-index/border/background. No changes to any other file.

### 2. Verify in the browser preview

Start the dev server via Claude Preview MCP:

1. `preview_start name="web"`.
2. `preview_resize preset="desktop"`.
3. `preview_screenshot` — confirm header looks right (still has its white strip).
4. Click the "Run all" button (`preview_click` on the button with text matching the `runAll` i18n key, or use `aria-label`). Screenshot — `BatchRunPanel` must now cover the entire viewport with a dim backdrop, not be clipped to the header row.
5. Close the panel (Esc or the close button). Screenshot — header looks normal again.
6. If a base spec is available for Compare, repeat for `DiffPanel`. If not (fresh session has no base), skip and note in commit.
7. `preview_stop`.

Collect screenshots (header baseline + BatchRunPanel open) as verification evidence; the summary commit message should reference they were checked.

Static checks:
```
pnpm --filter web exec tsc -b
pnpm --filter web test AppHeader
pnpm --filter web test BatchRunPanel
pnpm --filter web test DiffPanel
```
All must pass. The only changed CSS is `backdrop-blur` removal — no test should depend on that class.

### 3. Commit and archive

One commit for the fix:

```
fix(web): stop header backdrop-filter from trapping fixed dialogs

backdrop-filter creates a containing block for fixed descendants
(same rule as transform/filter), which confined BatchRunPanel and
DiffPanel (both `fixed inset-0 z-50`) to the header's frame rather
than the viewport. Removing backdrop-blur from the header restores
full-viewport modal overlays; the 95% opaque background is
sufficient on its own.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then the archive commit:

```
docs: tick AppHeader backdrop-blur TODO; archive spec + plan
```

Archive moves spec + plan from `active/` to `done/`, ticks the "AppHeader `backdrop-blur` creates a containing block..." line under "Follow-up from shipped work" in `docs/TODO.md` (`[ ]` → `[x]`), and appends a short pointer `— see docs/plans/done/2026-04-19-appheader-backdrop-blur.md`. Bump `Last updated:` if needed.

## Execution strategy

One implementer subagent for tasks 1 + 2. One archive subagent for task 3.
