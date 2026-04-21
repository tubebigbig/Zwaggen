# Zwaggen — TODO

Simple checklist of work not yet done. Future sessions: read this and pick one.

Last updated: 2026-04-22 (preserve-openapi-extensions)

## Fix

- [x] Lang toggle button clipped when showing `中文` — swap `btn-icon` (fixed `w-7`) for inline utility classes that auto-fit width. See `docs/plans/done/2026-04-19-lang-toggle-button.md`.
- [x] Responsive layout (RWD) — see `docs/plans/done/2026-04-20-responsive-layout.md`.
- [x] React `act(...)` warnings in TypePanel / RunPanel tests — see `docs/plans/done/2026-04-21-act-warnings.md`.
- [x] `pnpm --filter web build` passes `tsc -b` again — swept ~60 strict-mode errors (noUncheckedIndexedAccess, vi.fn generic drift, stale fixtures). See `docs/plans/done/2026-04-18-fix-web-build.md`.
- [ ] Manual UX pass on all shipped plans (real browser)
- [x] Drop PWA from apps/docs — stale workbox SW was serving cached 404s after content deploys; ships a tombstone sw.js to self-unregister existing installs. See `docs/plans/done/2026-04-20-drop-docs-pwa.md`.

## Feature

- [x] CI-mode CLI for batch + diff — see docs/plans/done/2026-04-19-ci-cli.md
- [ ] Saved request presets
- [ ] Per-environment `servers[]`
- [ ] Header capture + JSONPath filter expressions
- [ ] Postman collection import
- [x] Folders (nested) for Types and Endpoints — see `docs/plans/done/2026-04-20-folders-types-endpoints.md`.
- [x] Type extension / inheritance — multi-parent `ObjectType.extends?: string[]`; resolver flattens the chain for validator/example/diff; OpenAPI + JSON Schema round-trip via allOf; markdown refs became clickable anchors as part of this scope. See `docs/plans/done/2026-04-20-type-extension.md`.
- [ ] Drag-and-drop between folders in TypePanel and EndpointList (deferred from the folders feature — v1 uses a text Folder input).
- [ ] Drag-reorder parents in the TypeBuilder Extends chip picker (deferred from type-extension v1 — v1 uses remove + re-pick).
- [ ] Effective-shape preview panel in TypeBuilder (deferred polish from type-extension v1 — inherited + override rows already convey effective shape).
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
- [x] Spec version migration framework — replaced the inline v1→v2 branch in `fromJSON` with a registry + chain walker; tightened schemaVersion validation; documented the "Adding a new version" pattern. See `docs/plans/done/2026-04-20-spec-migration-framework.md`.
- [x] User-facing load-error modal on the web app — see `docs/plans/done/2026-04-21-load-error-modal.md`.
- [ ] zwag run — wire authentication (secrets via env vars or config file)
- [ ] zwag run — input injection (per-endpoint inputs from a JSON file, replace "1" placeholder)
- [ ] zwag run — request body support
- [ ] zwag run — parallel execution with concurrency flag
- [ ] zwag — --json output format
- [ ] "Run all = fresh network calls" toggle in batch runner
- [x] Preserve `x-*` extensions in OpenAPI importer — see `docs/plans/done/2026-04-22-preserve-openapi-extensions.md`.
- [x] TypePanel rapid-Add-type race: uncontrolled `defaultValue` on "Type name" input lets a stale-closure rename clobber a subsequent addType. Flip to controlled `value`/`onChange` or `key={selected}` remount. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-typepanel-add-type-race.md
- [x] AppHeader `backdrop-blur` creates a containing block that traps `fixed inset-0` dialogs (DiffPanel, BatchRunPanel) to the header's frame. Move `backdrop-filter` off the outer header or portal the dialogs. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-appheader-backdrop-blur.md
- [ ] Standalone single-file executables for `zwag` (cli) and `zwaggen-web` (web) — bundle Node + assets into per-OS binaries via Bun `--compile` or Node SEA, attach to GitHub Releases. Deferred from the release-flow plan because of per-OS matrix + signing complexity.
- [ ] Auto-promote on green CI — a separate, simpler workflow that fast-forwards a `staging` (or directly `production`) branch every time `main` goes green, decoupled from the explicit-version release.
- [ ] Pre-release / beta tag channels (`@next`, `@beta`) on npm.
- [ ] Publish `@zwaggen/core` as a public library when a third-party consumer materializes (currently bundled into cli, kept private).
- [ ] Publish `@zwaggen/proxy` to npm if/when there's a clear consumer story.
- [ ] Extract `apps/docs` into its own repo (`zwaggen-docs`?) so docs-only edits don't churn the main repo's git history.
- [x] Extend `AppHeader.openSpec` try/catch to cover the I/O phase — see `docs/plans/done/2026-04-21-open-spec-io-errors.md`.
- [ ] `LoadErrorModal` should move focus into the dialog on open (e.g., `autoFocus` on the Dismiss button or a ref-based focus shift). Today, screen-reader / keyboard users land behind the modal on the triggering Open button. Found during load-error-modal code review.
- [ ] `apps/web/src/storage/file.ts` `uploadFile()` swallows errors thrown inside its `input.onchange` async handler (`f.text()` rejections are lost; the outer Promise hangs forever, never resolves). Pre-existing — not regressed by `openSpec`'s widened catch, but the non-FSA branch of `openSpec` now implicitly relies on `uploadFile` rejecting on I/O failure. Wrap the onchange body in try/catch that resolves to an error sentinel (or rejects via a captured `reject`). Found during open-spec-io-errors code review.
- [ ] Extend OpenAPI `x-*` round-trip to info-level, schema-level, and parameter/response-level (deferred from preserve-openapi-extensions v1 — endpoint-level only).
- [ ] Stale zh-TW docs reference schemaVersion 1 — `apps/docs/zh-TW/guide/core-concepts.md` still documents `schemaVersion: 1` as current. Needs a sweep to v4 across both locales. Found during preserve-openapi-extensions code review (pre-existing drift, not a regression).
