# Docs Screenshots

The tutorial site at `apps/docs` embeds UI screenshots captured from `apps/web` via Playwright. These images can silently drift from the live UI.

## Rule

**Before any docs release (any push to `main` that touches `apps/docs/`), re-run the capture script if `apps/web` has changed since the last screenshot refresh:**

```bash
SCREENSHOTS=1 pnpm --filter web e2e:screenshots
```

The script starts the dev server, runs three Playwright specs, and rewrites all 13 PNGs under `apps/docs/public/screenshots/`. Commit the result as a separate commit with subject `docs: refresh screenshots from current UI`.

## When to run

- **Required:** any docs push that follows a UI change in `apps/web` (layout, colors, copy, labels, component restructure).
- **Optional:** regular drift check — run it anyway every few releases as a sanity pass.
- **Not required:** docs-only changes (markdown edits, config tweaks that don't affect what the screenshots show).

## Why

- Outdated screenshots are worse than no screenshots — they teach users about UI that no longer exists.
- Git diff on a screenshot is an honest proxy for "is my UI stable?" If you change a label and 8 PNGs shift, that's a signal.
- Playwright capture is deterministic enough that byte-identical output (zero diff) confirms no visible drift.

## Files

- Specs: `apps/web/e2e/docs-screenshots.spec.ts`, `apps/web/e2e/docs-screenshots-guide.spec.ts`, `apps/web/e2e/docs-screenshots-extras.spec.ts`.
- Output: `apps/docs/public/screenshots/*.png` (13 files).
