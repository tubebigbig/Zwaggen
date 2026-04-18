# Zwaggen — TODO

Simple checklist of work not yet done. Future sessions: read this and pick one.

Last updated: 2026-04-18

## Fix

- [ ] React `act(...)` warnings in TypePanel / RunPanel tests
- [ ] `pnpm --filter web build` fails `tsc -b` on pre-existing TS errors in `src/ui/EndpointEditor.tsx` (possibly-undefined `endpoint` usages, missing `!` assertions) and `tests/ui/TypeBuilder.example.test.tsx` (Mock generics). Playground deploy currently routes around this via `build:vite`; fix so the regular `build` script passes again.
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

- [ ] Canonical stringify for `schema/diff.ts` type equality
- [ ] "Run all = fresh network calls" toggle in batch runner
- [ ] Preserve `x-*` extensions in OpenAPI importer
- [ ] TypePanel rapid-Add-type race: uncontrolled `defaultValue` on "Type name" input lets a stale-closure rename clobber a subsequent addType. Flip to controlled `value`/`onChange` or `key={selected}` remount. (Found while building docs screenshot capture.)
- [ ] AppHeader `backdrop-blur` creates a containing block that traps `fixed inset-0` dialogs (DiffPanel, BatchRunPanel) to the header's frame. Move `backdrop-filter` off the outer header or portal the dialogs. (Found while building docs screenshot capture.)
