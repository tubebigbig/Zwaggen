# Plan — Fix lang toggle button layout

Spec: `docs/specs/active/2026-04-19-lang-toggle-button.md`.

Execute on branch `plan/lang-toggle-button` in `.worktrees/lang-toggle-button`. All commits inside the worktree. Small plan — only two task commits + one archive commit.

## Tasks

### 1. Replace `btn-icon` class on the lang toggle

**File:** `apps/web/src/ui/AppHeader.tsx` lines 254-262.

Change the button's `className` from:

```
btn-icon gap-1 px-2 text-xs font-medium text-slate-500 hover:text-slate-700
```

to:

```
inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700
```

Keep everything else in the button (title, aria-label, onClick, children) unchanged.

**Why:** The new class string is `.btn-icon`'s contents MINUS `w-7` (fixed width) and `justify-center` (not needed when content has a defined order), PLUS the extra pieces that were already applied inline (`gap-1 px-2 text-xs font-medium text-slate-500 hover:text-slate-700`). The `hover:border-slate-300 hover:bg-slate-50` pieces carry over from `.btn-icon:hover` so the hover affordance matches the other icon buttons in the header.

### 2. Verify visually in the playground dev server

Use the Claude Preview MCP (dev server config already committed to `.claude/launch.json` in a prior session — check it exists; if not, create one that maps `"web"` to `pnpm --filter web dev` on port 5173 with the absolute pnpm path).

Steps:
1. `preview_start name="web"`.
2. `preview_resize preset="desktop"` (1280×800).
3. `preview_screenshot` — sanity check header renders.
4. `preview_inspect selector="button[aria-label*='中文'], button[aria-label*='English']" styles=["width","padding","display","white-space"]` — verify `width` is not `28px`, is auto-sized to content (roughly 50-70px for "中文" case), and content is not overflowing.
5. Click the button (`preview_click`) to toggle to zh-TW. Screenshot + inspect again with label "EN". Confirm the button width naturally adjusts and the text is fully visible.
6. `preview_resize width=1024 height=768` (narrow desktop) — re-inspect. Button must still be visible (not clipped to x > viewport width).
7. `preview_stop`.

If the button is still clipped at 1024 wide, the header itself is overflowing — that's a pre-existing concern out of scope for this plan; record it as a concern in the commit message but don't fix it here.

Also run a quick static check:
```
pnpm --filter web exec tsc -b
pnpm --filter web test AppHeader
```
Must pass (zero errors, AppHeader.test.tsx still green).

### 3. Commit and archive

One commit for the change:

```
fix(web): make lang toggle button width auto-fit its label

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then the archive commit:

```
docs: tick lang toggle TODO; archive spec + plan
```

Archive commit moves spec + plan from `active/` to `done/` and adds a new line to `docs/TODO.md` under `## Fix` marked `[x]` noting the shipped fix. (There is no pre-existing TODO row for this bug — it was discovered mid-session — so this task adds a fresh `[x]` row under `## Fix`, not a tick of an existing row. Also bump `Last updated:` to `2026-04-19`.)

## Execution strategy

Small enough to dispatch as a single implementer subagent covering both task 1 and task 2, followed by one archive subagent for task 3. Two-stage review (spec + quality) after the implementation subagent; archive subagent can do a lightweight single review.
