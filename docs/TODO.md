# Zwaggen — TODO

Simple checklist of work not yet done. Future sessions: read this and pick one.

Last updated: 2026-04-19

## Fix

- [x] Lang toggle button clipped when showing `中文` — swap `btn-icon` (fixed `w-7`) for inline utility classes that auto-fit width. See `docs/plans/done/2026-04-19-lang-toggle-button.md`.
- [ ] Responsive layout (RWD) — app breaks at narrow/tablet widths (header row overflows off-screen, side panels crowd). Needs a systematic pass across `AppHeader`, the three-pane layout, and dialog positioning.
- [ ] React `act(...)` warnings in TypePanel / RunPanel tests
- [x] `pnpm --filter web build` passes `tsc -b` again — swept ~60 strict-mode errors (noUncheckedIndexedAccess, vi.fn generic drift, stale fixtures). See `docs/plans/done/2026-04-18-fix-web-build.md`.
- [ ] Manual UX pass on all shipped plans (real browser)

## Feature

- [ ] CI-mode CLI for batch + diff
- [ ] Saved request presets
- [ ] Per-environment `servers[]`
- [ ] Header capture + JSONPath filter expressions
- [ ] Postman collection import
- [x] Tutorial docs site (VitePress) — `apps/docs/` — all 13 English pages + full zh-TW translation shipped; see `docs/plans/done/2026-04-18-tutorial-docs-site.md`
- [x] Tutorial docs: screenshot sweep — 13 UI shots captured via Playwright (`pnpm --filter web e2e:screenshots`); wired into every Guide page in both locales
- [x] Tutorial docs: deploy — live at `docs.zwaggen.com` (tutorial) and `play.zwaggen.com` (playground) via Cloudflare Pages; auto-deploys on push to `main`

## Follow-up from shipped work

- [x] Canonical stringify for `schema/diff.ts` type equality — see docs/plans/done/2026-04-19-canonical-stringify-diff.md
- [ ] "Run all = fresh network calls" toggle in batch runner
- [ ] Preserve `x-*` extensions in OpenAPI importer
- [x] TypePanel rapid-Add-type race: uncontrolled `defaultValue` on "Type name" input lets a stale-closure rename clobber a subsequent addType. Flip to controlled `value`/`onChange` or `key={selected}` remount. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-typepanel-add-type-race.md
- [x] AppHeader `backdrop-blur` creates a containing block that traps `fixed inset-0` dialogs (DiffPanel, BatchRunPanel) to the header's frame. Move `backdrop-filter` off the outer header or portal the dialogs. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-appheader-backdrop-blur.md
