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

- [x] CI-mode CLI for batch + diff — see docs/plans/done/2026-04-19-ci-cli.md
- [ ] Saved request presets
- [ ] Per-environment `servers[]`
- [ ] Header capture + JSONPath filter expressions
- [ ] Postman collection import
- [ ] Versioned, manually-triggered release & deploy flow — Zwaggen needs a real release pipeline so end users can install `zwag` via `npm i -g @zwaggen/cli` or `npx zwag`, or download a single-file executable. `main` stays as the dev branch (free to land WIP); a release is an explicit, versioned event triggered manually.
  - **Release targets** (per release, all driven by one workflow):
    1. **Web app** — promote the chosen commit to a `production` (or `deploy`) branch that CF Pages watches; flip the CF Pages production branch in the dashboard one time.
    2. **`@zwaggen/cli` on npm** — published as a public package so `npm i -g @zwaggen/cli` works. (Will need to register the `@zwaggen` npm scope first.)
    3. **`@zwaggen/core` on npm** — publish as a library so third parties can consume the spec/runner/diff logic.
    4. **Single-file executable for `zwag`** — bundle the CLI into a self-contained binary (no Node install required) for macOS / Linux / Windows. Tools to evaluate: `pkg` (deprecated but works), Node 21+ `--experimental-sea-config`, `bun build --compile`, or Deno `compile`. Attach binaries to a GitHub Release.
  - **Trigger**: `workflow_dispatch` with inputs `{ ref (commit SHA on main), version (e.g. 0.2.0) }`. The workflow:
    1. Verifies CI is green on the chosen SHA.
    2. Bumps `version` in `packages/cli/package.json` and `packages/core/package.json` (and any others) on a release commit.
    3. Creates an annotated git tag `v<version>` on that commit.
    4. Publishes packages to npm via `pnpm publish` (needs `NPM_TOKEN` secret).
    5. Builds the standalone executables and attaches them to a GitHub Release named `v<version>`.
    6. FF-pushes the chosen commit to the `production` branch → CF Pages picks it up and deploys the web app.
  - **Versioning policy**: semver. `@zwaggen/cli` and `@zwaggen/core` may version independently or in lockstep — decide as part of the plan. Consider `changesets` if independent.
  - **Branches**: `main` (dev, anything goes), `production` (deploy gate, FF-only). No PRs, no branch protection — workflow uses `workflow_dispatch` permissions to push.
  - **Open questions for the plan**:
    - Lockstep vs independent versioning across packages?
    - Manual changelog vs `changesets`/`semantic-release`?
    - Which exec bundler? (Node SEA is most "official"; `bun build --compile` is the smoothest UX.)
    - Cross-platform builds: matrix in Actions, or build only Linux exec and tell mac/win users to use `npx`?
    - Is the npm scope `@zwaggen` available? If not, alt name (e.g. `zwaggen-cli` unscoped).
    - Do we publish `@zwaggen/proxy` too? It already ships as a package in the workspace.
  - **Out of scope for v1 of this plan**: auto-promote on green CI (separate, simpler workflow that could come later). Pre-release / beta tag channels.
- [x] Tutorial docs site (VitePress) — `apps/docs/` — all 13 English pages + full zh-TW translation shipped; see `docs/plans/done/2026-04-18-tutorial-docs-site.md`
- [x] Tutorial docs: screenshot sweep — 13 UI shots captured via Playwright (`pnpm --filter web e2e:screenshots`); wired into every Guide page in both locales
- [x] Tutorial docs: deploy — live at `docs.zwaggen.com` (tutorial) and `play.zwaggen.com` (playground) via Cloudflare Pages; auto-deploys on push to `main`

## Follow-up from shipped work

- [x] Canonical stringify for `schema/diff.ts` type equality — see docs/plans/done/2026-04-19-canonical-stringify-diff.md
- [ ] Deduplicate apps/web + @zwaggen/core — apps/web still has its own copy of schema/ and runner/. Migrate apps/web to import from @zwaggen/core and delete the duplicates (~82 import sites).
- [ ] zwag run — wire authentication (secrets via env vars or config file)
- [ ] zwag run — input injection (per-endpoint inputs from a JSON file, replace "1" placeholder)
- [ ] zwag run — request body support
- [ ] zwag run — parallel execution with concurrency flag
- [ ] zwag — --json output format
- [ ] "Run all = fresh network calls" toggle in batch runner
- [ ] Preserve `x-*` extensions in OpenAPI importer
- [x] TypePanel rapid-Add-type race: uncontrolled `defaultValue` on "Type name" input lets a stale-closure rename clobber a subsequent addType. Flip to controlled `value`/`onChange` or `key={selected}` remount. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-typepanel-add-type-race.md
- [x] AppHeader `backdrop-blur` creates a containing block that traps `fixed inset-0` dialogs (DiffPanel, BatchRunPanel) to the header's frame. Move `backdrop-filter` off the outer header or portal the dialogs. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-appheader-backdrop-blur.md
