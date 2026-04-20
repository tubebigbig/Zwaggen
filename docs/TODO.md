# Zwaggen — TODO

Simple checklist of work not yet done. Future sessions: read this and pick one.

Last updated: 2026-04-20 (docs-npm-deploy)

## Fix

- [x] Lang toggle button clipped when showing `中文` — swap `btn-icon` (fixed `w-7`) for inline utility classes that auto-fit width. See `docs/plans/done/2026-04-19-lang-toggle-button.md`.
- [x] Responsive layout (RWD) — see `docs/plans/done/2026-04-20-responsive-layout.md`.
- [ ] React `act(...)` warnings in TypePanel / RunPanel tests
- [x] `pnpm --filter web build` passes `tsc -b` again — swept ~60 strict-mode errors (noUncheckedIndexedAccess, vi.fn generic drift, stale fixtures). See `docs/plans/done/2026-04-18-fix-web-build.md`.
- [ ] Manual UX pass on all shipped plans (real browser)

## Feature

- [x] CI-mode CLI for batch + diff — see docs/plans/done/2026-04-19-ci-cli.md
- [ ] Saved request presets
- [ ] Per-environment `servers[]`
- [ ] Header capture + JSONPath filter expressions
- [ ] Postman collection import
- [x] Folders (nested) for Types and Endpoints — see `docs/plans/done/2026-04-20-folders-types-endpoints.md`.
- [ ] Type extension / inheritance — `Foo extends Bar` with field override. Resolver flattens the chain; exports as OpenAPI `allOf`.
- [ ] Drag-and-drop between folders in TypePanel and EndpointList (deferred from the folders feature — v1 uses a text Folder input).
- [x] Versioned, manually-triggered release & deploy flow — see docs/plans/done/2026-04-19-release-deploy-flow.md
- [x] Tutorial docs site (VitePress) — `apps/docs/` — all 13 English pages + full zh-TW translation shipped; see `docs/plans/done/2026-04-18-tutorial-docs-site.md`
- [x] Tutorial docs: screenshot sweep — 13 UI shots captured via Playwright (`pnpm --filter web e2e:screenshots`); wired into every Guide page in both locales
- [x] Tutorial docs: deploy — live at `docs.zwaggen.com` (tutorial) and `play.zwaggen.com` (playground) via Cloudflare Pages; auto-deploys on push to `main`
- [x] PWA offline docs — installable app + full precache for `apps/docs`; see `docs/plans/done/2026-04-19-pwa-offline-docs.md`.
- [x] Docs polish — multi-size crisp favicons + SEO baseline (OG/Twitter/canonical/hreflang, sitemap, robots); see `docs/plans/done/2026-04-19-docs-polish-favicon-seo.md`.
- [x] npm-only install docs + controlled docs deploy — `deploy-docs.yml` workflow FF-pushes main → docs; Cloudflare Pages now watches the `docs` branch; docs install page + quickstart (en + zh-TW) rewritten for `npx @zwaggen/web`; HeroInstall card on home page. See `docs/plans/done/2026-04-20-docs-npm-deploy.md`.

## Follow-up from shipped work

- [x] Canonical stringify for `schema/diff.ts` type equality — see docs/plans/done/2026-04-19-canonical-stringify-diff.md
- [x] Deduplicate apps/web + @zwaggen/core — migrated apps/web to import from @zwaggen/core and deleted the duplicates (48 import sites across 87 files). See `docs/plans/done/2026-04-20-dedupe-web-core.md`.
- [ ] zwag run — wire authentication (secrets via env vars or config file)
- [ ] zwag run — input injection (per-endpoint inputs from a JSON file, replace "1" placeholder)
- [ ] zwag run — request body support
- [ ] zwag run — parallel execution with concurrency flag
- [ ] zwag — --json output format
- [ ] "Run all = fresh network calls" toggle in batch runner
- [ ] Preserve `x-*` extensions in OpenAPI importer
- [x] TypePanel rapid-Add-type race: uncontrolled `defaultValue` on "Type name" input lets a stale-closure rename clobber a subsequent addType. Flip to controlled `value`/`onChange` or `key={selected}` remount. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-typepanel-add-type-race.md
- [x] AppHeader `backdrop-blur` creates a containing block that traps `fixed inset-0` dialogs (DiffPanel, BatchRunPanel) to the header's frame. Move `backdrop-filter` off the outer header or portal the dialogs. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-appheader-backdrop-blur.md
- [ ] Standalone single-file executables for `zwag` (cli) and `zwaggen-web` (web) — bundle Node + assets into per-OS binaries via Bun `--compile` or Node SEA, attach to GitHub Releases. Deferred from the release-flow plan because of per-OS matrix + signing complexity.
- [ ] Auto-promote on green CI — a separate, simpler workflow that fast-forwards a `staging` (or directly `production`) branch every time `main` goes green, decoupled from the explicit-version release.
- [ ] Pre-release / beta tag channels (`@next`, `@beta`) on npm.
- [ ] Publish `@zwaggen/core` as a public library when a third-party consumer materializes (currently bundled into cli, kept private).
- [ ] Publish `@zwaggen/proxy` to npm if/when there's a clear consumer story.
- [ ] Extract `apps/docs` into its own repo (`zwaggen-docs`?) so docs-only edits don't churn the main repo's git history.
