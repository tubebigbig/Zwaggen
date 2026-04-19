# Spec: Versioned, manually-triggered release & deploy flow

Date: 2026-04-19
Status: active
TODO entry: "Versioned, manually-triggered release & deploy flow" (Feature)

## Goal

Give Zwaggen a real release pipeline so end users can install and run it without cloning the repo, and so production deploys of the web app are gated by an explicit, versioned event instead of every push to `main`.

After this lands, three new user stories work:

- `npm i -g @zwaggen/cli` then `zwag --help` / `zwag run` / `zwag diff`.
- `npx @zwaggen/web` boots the SPA on `127.0.0.1:4173` and opens the user's browser.
- `play.zwaggen.com` redeploys only when a release is cut, not on every push to `main`.

## Non-goals (deferred to follow-up TODOs)

- Standalone single-file executables (`pkg`, Node SEA, `bun build --compile`) for cli or web.
- Publishing `@zwaggen/core` to npm. It stays `private: true` and is bundled into cli's dist.
- Publishing `zwaggen-proxy` to npm.
- Auto-promote on green CI (a separate, simpler workflow that could come later).
- Pre-release / beta tag channels (`@next`, `@beta`).
- Per-package independent versioning or `changesets`-style PR-driven release.
- Releasing arbitrary historical SHAs / hotfix-from-old-tag flows. v1 releases `main` HEAD only.
- Extracting `apps/docs` into its own repo (separate future TODO).
- `apps/docs` (`docs.zwaggen.com`) deployment behaviour is unchanged — it keeps auto-deploying from `main`.

## Decisions (locked during brainstorming)

| # | Decision                                                | Reasoning                                                                                            |
| - | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1 | v1 ships: `@zwaggen/cli` + `@zwaggen/web` + `production` branch | Smallest viable release; standalone exec deferred                                                |
| 2 | `@zwaggen/core` stays private, bundled into cli         | No third-party library consumer today; `tsup --bundle` makes core inlining trivial                   |
| 3 | Web app distribution is the npm wrapper only (no exec)  | Standalone exec is materially harder (per-OS matrix, signing); npm covers the realistic audience now |
| 4 | Lockstep semver across `@zwaggen/cli` + `@zwaggen/web`  | Solo maintainer; `changesets` ceremony has no leverage; lockstep makes "which versions match" trivial|
| 5 | Single root `CHANGELOG.md` (not per-package)            | Lockstep makes one file the natural shape                                                            |
| 6 | Production gate applies only to `play.zwaggen.com`      | Tutorial typo fixes shouldn't require a version bump; docs has no release semantics                  |
| 7 | Workflow hard-fails if CI is not green on the release SHA | Cheap `gh api` call; prevents "shipped a broken build" foot-gun                                     |
| 8 | Release from `main` HEAD only — no `ref` input          | Eliminates divergence between tag/main; matches Vue/Vite/Astro pattern                               |
| 9 | License is MIT                                          | Standard for OSS dev tools; no copyleft constraints                                                  |
| 10 | npm scope `@zwaggen` confirmed available (registry 404 for `@zwaggen/cli`, `@zwaggen/web`, `@zwaggen/core`, and unscoped `zwaggen` as of 2026-04-19) | User to register the scope as part of one-time setup |

## Architecture

### Branches

- **`main`** — dev branch. Anything goes. CI (`test.yml`) runs on every push and PR. The release workflow also writes one commit per release here (the version-bump commit).
- **`production`** — deploy gate for `play.zwaggen.com`. Only the release workflow writes here, FF-only. Initially created pointing at `main` head; CF Pages dashboard production-branch setting is flipped from `main` → `production` once, by hand.

No branch protection (solo project, no PRs).

### Packages on npm (scoped, public)

| Package             | Source path           | Bin                         | Bundles                     |
| ------------------- | --------------------- | --------------------------- | --------------------------- |
| `@zwaggen/cli`      | `packages/cli/`       | `zwag` → `bin/zwag.js`      | `@zwaggen/core` inlined     |
| `@zwaggen/web`      | `apps/web/`           | `zwaggen-web` → `bin/zwaggen-web.js` | Vite SPA + tiny static-server wrapper |

Stays private (no publish):

- `@zwaggen/core` (`packages/core/`) — workspace dep only, inlined into cli.
- `zwaggen-proxy` (`packages/proxy/`) — no consumer story yet.
- `web` is renamed to `@zwaggen/web` as part of this work (currently `name: "web"`).

### `@zwaggen/web` runtime wrapper

A new `apps/web/bin/zwaggen-web.js` that, when invoked:

1. Resolves the bundled `dist/` directory relative to the package install location.
2. Starts a static file server with SPA fallback (every unknown path → `index.html`) using [`sirv`](https://github.com/lukeed/sirv) (~3 KB, dependency-free, well-maintained).
3. Defaults: bind `127.0.0.1`, port `4173` (Vite preview convention). If the port is busy, scans upward for the next free port.
4. Opens the printed URL in the user's default browser via [`open`](https://github.com/sindresorhus/open).
5. Logs the URL clearly.
6. Flags: `--port <n>`, `--host <addr>`, `--no-open`, `--help`, `--version`.
7. Handles `SIGINT` cleanly.

Runtime deps: `sirv`, `open`. Both are added to `apps/web`'s `dependencies` (not `devDependencies`).

### Release workflow

`.github/workflows/release.yml`. Triggered by `workflow_dispatch` only.

```yaml
on:
  workflow_dispatch:
    inputs:
      version:
        description: "semver e.g. 0.2.0 (no leading v)"
        required: true
```

**Step sequence (hard-fail on any error):**

1. **Checkout `main`** at full depth + tags. Capture `RELEASE_SHA = git rev-parse HEAD`. This is the exact commit being released.
2. **Validate `version` input.** Must match `^\d+\.\d+\.\d+$`. Must be strictly greater than the latest `v*` git tag (if any) when compared via semver.
3. **Verify CI is green on `RELEASE_SHA`.** Use `gh api` to query workflow runs for `test.yml` filtered by `head_sha=RELEASE_SHA`; assert at least one with `conclusion == "success"`. Hard-fail if not found.
4. **Setup toolchain.** pnpm 10, Node 20 (matches `test.yml`). `pnpm install --frozen-lockfile`.
5. **Bump versions.** Write `version` into `apps/web/package.json` and `packages/cli/package.json`. (Use `pnpm version --no-git-tag-version` per package, or a tiny `node -e` script — implementation detail for the plan.)
6. **Update `CHANGELOG.md`.** Prepend a new section: `## v<version> — YYYY-MM-DD` followed by the commit subject lines from `git log <prev-tag>..HEAD --pretty="- %s"` (or `- Initial release` if no prior tag). This is a scaffold — between releases, the user can hand-edit `CHANGELOG.md` on `main` to refine prior-version sections, and the next release simply prepends on top of whatever's there.
7. **Commit the bump.** Message: `release: v<version>`. Author identity: `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>` (standard GitHub Actions bot). No co-author trailer (the project's `Co-Authored-By: Claude Opus 4.7 …` convention applies to Claude-driven commits during plan execution, not to automation commits).
8. **Push bump commit to `main` (fail-fast gate).** `git push origin HEAD:main`. If push is rejected because `main` advanced during the run, `git pull --rebase origin main && git push` once — the bump is a pure `package.json` + `CHANGELOG.md` edit, so the rebase is always trivial. If the second push also fails, **abort** — nothing has been published yet, the runner state is throwaway, no recovery needed.
9. **Build cli.** `pnpm --filter @zwaggen/cli build`. tsup config updated to bundle `@zwaggen/core` (drop it from `external`). Result: `packages/cli/dist/cli.js` is self-contained — no runtime `@zwaggen/core` resolution needed.
10. **Build web.** `pnpm --filter @zwaggen/web build` produces `apps/web/dist/`.
11. **Publish to npm.** `pnpm publish --access public --no-git-checks` for both `packages/cli` and `apps/web`. Requires `NPM_TOKEN` secret in env via `NODE_AUTH_TOKEN` + `.npmrc` (`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`).
12. **Tag.** `git tag -a v<version> -m "Release v<version>"` on the bump commit; `git push origin v<version>`.
13. **GitHub Release.** `gh release create v<version> --generate-notes`. Body is the commit log between tags; user can edit after.
14. **FF-push to `production`.** `git push origin HEAD:production` (the bump commit, now also on `main`). CF Pages picks it up and rebuilds `play.zwaggen.com`.
15. **Smoke test the published artifacts.** On the runner:
    - `npm pack @zwaggen/cli@<version>` → run `npx <tarball> --help` and `npx <tarball> diff packages/cli/tests/fixtures/spec-a.json packages/cli/tests/fixtures/spec-a.json` — assert success.
    - `npm pack @zwaggen/web@<version>` → spawn `npx <tarball> --no-open --port 0` in background, capture printed URL, `curl --fail` it, kill the process, assert success.
16. **Notify.** Step summary (`$GITHUB_STEP_SUMMARY`) lists: version, SHA, npm package URLs, GitHub Release URL.

**Failure semantics.**

- **Pre-publish (steps 1–10).** Any failure aborts cleanly: nothing is on npm, no tag exists, `production` untouched. The bump commit on `main` (pushed in step 8) stays — that's intentional, it's the gate that says "we're now in v0.2.0 territory." Re-running the workflow with the same `version` is fine: step 5 sees the version is already correct (no-op bump), step 7 sees nothing to commit (no-op), step 8 push is a no-op, then it proceeds to retry the failed step.
- **Post-publish (step 11 onward).** Once npm has the package, the version cannot be reused (no un-publish after 72h, only deprecate). If steps 12–16 fail, **do NOT re-run the workflow** — the validation in step 2 (`version > latest tag`) will pass on the first failure (no tag yet) and republish would error, but on subsequent failures (tag exists) validation rejects. Recovery is by hand for the specific missing step:
  - Tag missing: `git tag -a v<version> <bump-sha> -m "Release v<version>" && git push origin v<version>`.
  - GH Release missing: `gh release create v<version> --generate-notes` from a clone.
  - `production` not updated: `git push origin v<version>^{commit}:production` from a clone.
  - Smoke test failure: investigate locally with `npx @zwaggen/cli@<version> --help` etc.; if a real bug, cut a fix-forward `<version+0.0.1>` release.
- **Cancellation.** Cancelling a running workflow mid-step is treated like a failure of that step — same recovery rules.

**Permissions.** The workflow needs `contents: write` (push to main + production + tag), `id-token: write` (for npm provenance, see "Optional hardening"), and access to the `NPM_TOKEN` secret. No third-party Actions beyond `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, and the `gh` CLI (preinstalled).

### One-time manual setup (documented in plan, executed by user)

These are NOT automated by the workflow — they're prerequisites the user does once before the first release:

1. **Register `@zwaggen` scope on npmjs.com.** Free, requires npm account.
2. **Create an npm automation token** (`https://www.npmjs.com/settings/<user>/tokens` → "Automation"). Add to GitHub repo secrets as `NPM_TOKEN`.
3. **Create empty `production` branch.** From `main` head: `git push origin main:production`.
4. **Flip CF Pages production branch.** In CF Pages dashboard for the `play.zwaggen.com` project, change "Production branch" from `main` → `production`. Trigger one manual rebuild from the new branch to confirm it works. (Leave docs site CF Pages config alone.)
5. **Add `LICENSE` (MIT) at repo root** if not already present. (Plan will check and add.)

## Per-package changes required

### `packages/cli/package.json`

- Drop `"private": true` (currently absent — verify).
- Add `"publishConfig": { "access": "public" }`.
- Add `"license": "MIT"`, `"description"`, `"repository"`, `"homepage"`, `"keywords"`, `"author"`.
- Keep `bin`, `files`, `type`, `dependencies`, `devDependencies` as-is.
- Drop `"@zwaggen/core": "workspace:*"` from `dependencies` after switching tsup to bundle it.

### `packages/cli` tsup config

- Currently builds with `@zwaggen/core` as a workspace dep import (external).
- Switch to `bundle: true` with `@zwaggen/core` excluded from `external`. Validate that `dist/cli.js` runs standalone (no `node_modules/@zwaggen/core` lookup) by `node packages/cli/dist/cli.js --help` from a temp dir without workspace symlinks.

### `apps/web/package.json`

- Rename `"name": "web"` → `"name": "@zwaggen/web"`. (Directory stays at `apps/web` — only the package.json `name` field changes. pnpm `--filter` matches the package name, so the rename will break every existing `pnpm --filter web …` invocation; see "Filter rename audit" below.)
- Drop `"private": true`.
- Add `"publishConfig": { "access": "public" }`, `"license": "MIT"`, `"description"`, `"repository"`, `"homepage"`, `"keywords"`, `"author"`, `"version": "0.1.0"` (will be bumped on first release).
- Add `"bin": { "zwaggen-web": "./bin/zwaggen-web.js" }`.
- Add `"files": ["dist", "bin"]`.
- Add runtime deps: `"sirv"`, `"open"`.
- Add a `prepublishOnly` script that runs `pnpm build` (defensive — workflow builds explicitly, but local `pnpm publish` also stays safe).
- Update root `pnpm-workspace.yaml` filter references if any depend on the old name `web`. (Inventory: `pnpm --filter web` is used in root scripts; need to either rename the filter to `@zwaggen/web` everywhere or keep a workspace alias.)

### `apps/web/bin/zwaggen-web.js` (new)

Self-contained ESM script implementing the wrapper described above. ~50 lines.

### `packages/core/package.json`

No changes. Stays `"private": true`.

### Root files

- New `CHANGELOG.md` at repo root with a single `# Changelog` header. Workflow prepends per-release sections.
- `LICENSE` at repo root. MIT. Copyright line: `Copyright (c) 2026 Victor Liang` (matches existing repo git author). User can override at plan time if they want a different name.
- Optional: per-package `README.md` for both publish targets. Reuse existing `packages/cli/README.md` if present; create `apps/web/README.md` from scratch (install + run + flags).

### Filter rename audit (`pnpm --filter web` → `pnpm --filter @zwaggen/web`)

Every existing reference to the `web` filter must be updated. Inventoried:

- `package.json` (root) — `dev`, `docs:*` left alone, but `dev` script uses `--filter web`.
- `.github/workflows/test.yml` — two invocations (`tsc -b`, `test`). Critical — CI breaks if missed.
- `apps/docs/installation.md` and `apps/docs/zh-TW/installation.md` — user-facing tutorial, mentions `pnpm --filter web install --ignore-scripts`.
- `docs/deploy.md` — three references (the CF Pages build command and reproduction recipes).

Plan must update all of them in the same change as the package rename, then verify root scripts (`pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`) and `pnpm --filter @zwaggen/web e2e:screenshots` still work end-to-end.

Historical references inside `docs/plans/done/*` and `docs/specs/done/*` are NOT updated — they describe shipped work and are immutable history.

## Workflow file: skeleton

(Illustrative — exact YAML lives in the plan / implementation.)

```yaml
name: release
on:
  workflow_dispatch:
    inputs:
      version:
        description: "semver e.g. 0.2.0 (no leading v)"
        required: true
permissions:
  contents: write
  id-token: write   # for npm provenance
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org
      # ... validate version, check CI green, install, bump, build, publish, tag, push, smoke
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Optional hardening (recommend for plan, not blocking)

- **npm provenance**. `pnpm publish --provenance` adds an attested SLSA build statement to the published tarball, visible on the npm web UI. Requires `id-token: write` (already in permissions). Free reputational signal that the package was built from this repo's CI on this commit.
- **`--dry-run` mode**. Add a `dry_run` boolean input to the workflow that skips steps 8 and 11–14 (push-to-main, publish, tag, GH Release, push-to-prod) but runs everything else (validate, CI-green check, build, smoke-test against locally-built tarballs), for testing changes to the workflow itself without burning a version number.

## Risks

| Risk                                                                                  | Mitigation                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm publish` of a workspace package with `workspace:*` deps fails or publishes a broken spec | Bundle `@zwaggen/core` into cli (kills the workspace dep entirely). Verified by smoke step.    |
| Race: someone pushes to `main` during the workflow run                                | Push step does pull-rebase + retry once. Bump is pure `package.json` edits — rebase is trivial.    |
| CF Pages prod-branch flip is forgotten                                                | One-time setup is documented in plan + checked off explicitly before the first release.            |
| `@zwaggen` scope gets squatted between now and setup                                  | Register the scope as the very first step of plan execution.                                       |
| Smoke test fails after publish (already on npm)                                       | Fix-forward by cutting next patch. Documented behaviour, not a bug.                                |
| Renaming `web` → `@zwaggen/web` breaks existing root scripts / docs / CI              | Plan includes audit of all `--filter web` usages; update in same change.                           |

## Success criteria

The spec is satisfied when:

- A user can run `npm i -g @zwaggen/cli` and then `zwag --help` works.
- A user can run `npx @zwaggen/web` and a browser opens to a working SPA on a localhost URL.
- A maintainer can dispatch the `release` workflow with `version: 0.2.0`, the workflow finishes green, and the result is: bump commit on `main`, tag `v0.2.0`, GitHub Release `v0.2.0`, two npm packages published at `0.2.0`, `production` branch updated, `play.zwaggen.com` reflects the new build.
- If CI was not green on `main` HEAD, the workflow aborts before any publish/tag/push.
- The existing `test.yml` workflow continues to work unchanged on every push to `main`.
- `docs.zwaggen.com` continues to auto-deploy from `main` (unchanged).
