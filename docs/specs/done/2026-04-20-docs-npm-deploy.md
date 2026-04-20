# Spec — npm-only install docs + controlled docs deploys

**Status:** active
**Date:** 2026-04-20
**Scope:** `apps/docs/` content + `.github/workflows/deploy-docs.yml` + README contributor section.

## Goal

Two things shipped together because they're the same story:

1. Make `npx @zwaggen/web` the only install path the docs show. Contributors who want to hack on the code follow the repo `README.md` instead.
2. Replace the existing "auto-deploy docs.zwaggen.com on every push to `main`" behaviour with a controlled, manually-triggered deploy: run a GitHub Actions workflow, it FF-pushes `main` → `docs`, Cloudflare Pages watches `docs` and publishes.

## Motivation

Today `apps/docs/installation.md` is written as if Zwaggen ships only from a clone. That pre-dates the release-flow plan that started publishing `@zwaggen/web` (and `@zwaggen/cli`) to npm. The docs bury the ergonomic npm path and steer every first-time user through `pnpm install`, which is friction most of them don't need. The playground-first framing helps, but once a user decides to install, the clone path is the only thing we tell them about.

On the deploy side, `docs.zwaggen.com` auto-publishes on every merge to `main`. This mixes content changes (rewording a page) with code-change-driven doc touch-ups (screenshot refreshes, TODO ticks, plan moves) and pushes them live without review. `play.zwaggen.com` already got the controlled treatment via the `production` branch in `release.yml`; docs should have the same "ship when you mean to" property. Unlike the play release, docs doesn't need version bumps or npm publishing — the branch push is the entire deploy.

## Non-goals

- No auto-tag for docs releases. The branch SHA is the deploy identity; CF Pages' dashboard records it.
- No version field in `apps/docs/package.json` changes. Docs is private, not an npm artifact.
- No publishing of `@zwaggen/proxy`. That's a separate TODO item; the install page mentions proxy only with a "coming soon" note until it ships.
- No changes to `release.yml`. The cli/web release flow and the `production` branch pattern stay as-is. Docs gets its own workflow file.
- No CI-side Cloudflare token or Wrangler upload. The existing git-integration deploy (CF watches a branch) is what we switch, not what we replace.
- No rewrites of Guide pages beyond the install + quickstart flow.
- No tooling to automate the one-off CF Pages dashboard setting change (main → docs). A manual step with a short checklist is the ship condition.

## Design

### Deploy workflow — `.github/workflows/deploy-docs.yml`

- Trigger: `workflow_dispatch` only. No event-based deploy. User runs "Deploy docs" manually from the Actions tab (optionally targeting a non-head SHA for rollback).
- Concurrency group: `deploy-docs`, `cancel-in-progress: false`. Serialises deploys so two clicks don't race the branch.
- Permissions: `contents: write` (for the branch push).
- Steps, in order:
  1. Checkout `main` at `fetch-depth: 0` so the FF-push has the full history.
  2. Capture the deploy SHA (`git rev-parse HEAD`) into an output + env for the step summary.
  3. Setup pnpm + Node 20 + install with `--frozen-lockfile`.
  4. Smoke-build: `pnpm --filter docs build`. Fails the job if the site doesn't build; prevents pushing a broken branch.
  5. Configure the `github-actions[bot]` git author (matches `release.yml`).
  6. FF-push `main` → `docs`: `git push origin HEAD:docs`. On rejection, `git pull --rebase origin docs` + retry once. If the second push fails, fail the job loudly — means someone force-pushed `docs` out of band.
  7. Step summary: deploy SHA, link to the Cloudflare Pages dashboard (hardcoded URL; stable).

Rollback: re-run the workflow from the "Run workflow" dropdown, pick an older SHA or branch. CF Pages deploys the SHA that's at the tip of `docs` after the FF push.

One-off manual setting change: in the Cloudflare Pages dashboard, docs project's "Production branch" moves from `main` to `docs`. Documented in the ship checklist; no CI automation.

### Docs content rewrite

**`apps/docs/installation.md` — full rewrite.**

Structure:
1. Playground-first note (unchanged placement, ~unchanged wording).
2. Prerequisites: Node ≥ 20, modern Chromium browser. (No pnpm. No Git.)
3. "Run Zwaggen" — one code block: `npx @zwaggen/web`. Explain that npx downloads, serves the pre-built SPA via `sirv` at `http://127.0.0.1:4173`, opens the browser. Note the `--port`, `--host`, and `--no-open` flags (already supported by `apps/web/bin/zwaggen-web.js`).
4. "Stop the server" — a short note about `Ctrl+C`.
5. Optional CLI run: `npx @zwaggen/cli` for batch + diff. Link to the Guide's CLI page.
6. CORS proxy: "Coming soon as `npx @zwaggen/proxy`. For now, run your own CORS proxy or use the bundled proxy by cloning the repo (see the repo README)." — short. Doesn't sell clone as a first-class option, just acknowledges it exists.
7. Troubleshooting: trim to npm-relevant issues — Node version mismatches, browser choice, port conflicts. Drop pnpm-specific items.

**`apps/docs/quickstart.md` — single code block change.**

Step 1 ("Open the app") swaps `pnpm dev` → `npx @zwaggen/web`. Everything below (base URL, type builder, endpoint editor, response assertions, send) is unchanged; the UI walkthrough doesn't depend on the install path.

**`apps/docs/zh-TW/installation.md` and `apps/docs/zh-TW/quickstart.md`** — translated mirrors of the English rewrites. Same structure, same code blocks.

**Other docs pages** — scanned but untouched unless they reference `pnpm dev` or clone-specific instructions. A grep sweep during implementation confirms the blast radius.

**`README.md` — add a "Contributing / developing" section.**

For contributors who want to run from source. Content:
- `git clone … && cd Zwaggen && pnpm install`
- `pnpm dev` starts the web app; `pnpm docs:dev` starts the docs site locally.
- `pnpm -r test && pnpm -r lint` to validate.
- Point at `docs/rules/` for project invariants.

Kept short. No dependency tree, no deep workspace tour — just enough for someone cloning the repo for the first time to find their footing.

### Coordination with the current deploy

After the branch merges to `main`, the user performs the CF Pages dashboard change (main → docs) manually. Until they do, nothing is broken — but the new workflow's first run won't deploy anything new because CF still watches main. The ship checklist is explicit about this step.

There is a transient window between:
- Merging this spec/plan to main (docs content changed but CF still auto-deploys from main → live site flips to the new content).
- Flipping the CF dashboard setting to `docs`.

During that window, the live site already shows the new content (CF deployed on the merge). Acceptable — the content change was the point. The CF change is about *future* control, not about this deploy.

### Edge cases

- **`docs` branch doesn't exist yet.** First workflow run creates it via `git push origin HEAD:docs`. CF Pages starts watching it after the dashboard change.
- **Someone pushes to `docs` out-of-band.** The workflow's `pull --rebase + retry` handles non-trivial divergence. A history-rewriting force-push would need manual intervention; logged as an expected failure.
- **Docs build fails during workflow.** Job fails before the push. `docs` stays at its previous SHA; live site unaffected.
- **Wrong SHA dispatched (user rolls back).** Re-run the workflow with an older branch/SHA. The FF-push with the older SHA will fail (non-fast-forward); the retry does a rebase which also won't work for a backwards move. Treat this as "rollback requires force" — the user force-pushes `docs` to the target SHA manually when rolling back. Documented, not automated; rollbacks are rare and manual is safer than automating a force push in CI.

## Testing

- **Workflow smoke test** — after the file lands on `main`, run the workflow in dry mode once (or on a throwaway branch/target) to confirm the build step succeeds and the push path works. Concretely: before flipping the CF dashboard, run the workflow once against `main`; confirm `origin/docs` is created and points at the right SHA.
- **Docs build regression** — `pnpm --filter docs build` runs clean in CI during the smoke step. Add it to `test.yml`'s job too so every PR that touches `apps/docs/` catches build breaks early.
- **Content sanity** — manual read-through of the rewritten installation + quickstart pages, both locales, checking links resolve. No automated content test.
- **Rollback exercise** — after first successful deploy, force-push `docs` backwards to the prior SHA once, confirm CF re-deploys the older content.

## Ship checklist (post-merge, in order)

1. FF-merge `plan/docs-npm-deploy` to `main`. Push origin.
2. Run the `deploy-docs` workflow from the Actions tab — this creates the `docs` branch.
3. In the Cloudflare Pages dashboard, open the docs project. Settings → Builds & deployments → Production branch → change from `main` to `docs`. Save.
4. Trigger one more manual deploy (CF rebuilds from the `docs` branch).
5. Verify `docs.zwaggen.com` is live and shows the new install page.
6. Move spec + plan to `done/`, tick the TODO.
7. Update the auto-memory entry for live URLs: note that docs.zwaggen.com now deploys from `docs`, not `main`.

## Open questions

None — decided: approach (a) FF-push + CF watches `docs`, trigger workflow_dispatch, docs-only content, no version bump, proxy mentioned with "coming soon", CF dashboard change is manual.
