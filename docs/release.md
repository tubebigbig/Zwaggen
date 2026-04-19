# Release procedure

This is the maintainer's runbook for cutting a Zwaggen release. The
flow is fully manual — releases happen only when a maintainer dispatches
`.github/workflows/release.yml` from the GitHub Actions UI.

## One-time setup (do these once before the first release)

1. **Register the `@zwaggen` scope on npm.** Sign in at
   [npmjs.com](https://www.npmjs.com), create an org or personal scope
   named `zwaggen` (free tier is fine — both packages are public).

2. **Bootstrap both packages manually at an initial version.** Trusted
   Publishing (step 3) requires a package to exist on npm before you can
   configure it, so the first publish has to happen locally with
   interactive 2FA. From a clean `main` checkout:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @zwaggen/core build
   pnpm --filter @zwaggen/cli build
   pnpm --filter @zwaggen/web build

   cd packages/cli && pnpm publish --access public --no-git-checks && cd ../..
   cd apps/web     && pnpm publish --access public --no-git-checks && cd ../..
   ```

   npm will prompt for your 2FA code on each publish.

3. **Configure Trusted Publishing** on npmjs.com for each package. Visit
   the package page → **Settings** → **Trusted Publisher** → **GitHub
   Actions**, and enter:

   - Organization or user: `<your-github-username>` (e.g. `tubebigbig`)
   - Repository: `Zwaggen`
   - Workflow filename: `release.yml`
   - Environment: (leave empty)

   Save. Repeat for both `@zwaggen/cli` and `@zwaggen/web`. After this,
   the release workflow authenticates to npm via OIDC — no `NPM_TOKEN`
   secret is needed.

4. **Create the `production` branch.** From a local clone of `main`:

   ```bash
   git push origin main:production
   ```

5. **Flip the CF Pages production branch.** In the Cloudflare Pages
   dashboard for the `play.zwaggen.com` project, change "Production
   branch" from `main` → `production`. Trigger a manual rebuild from
   `production` to confirm CF Pages picks up the new branch correctly.
   Leave the `docs.zwaggen.com` project alone — it keeps deploying from
   `main`.

6. **Confirm the LICENSE and CHANGELOG.md files exist at repo root**
   (added by this plan's earlier tasks; verify before first release).

## Cutting a release

1. Make sure `main` is at the commit you want to release. The workflow
   releases `main` HEAD only — there's no SHA picker.

2. Make sure CI is green on that commit. The workflow refuses to
   proceed otherwise; check
   `https://github.com/<owner>/<repo>/actions/workflows/test.yml` for a
   ✅ on the latest commit.

3. Decide the version. Lockstep semver — both `@zwaggen/cli` and
   `@zwaggen/web` go to the same number. Patch for bug fixes, minor for
   features, major for breaking changes (mostly to spec format / cli
   args).

4. Open the `release` workflow run UI:
   `https://github.com/<owner>/<repo>/actions/workflows/release.yml`.
   Click **Run workflow**. Inputs:
   - `version`: e.g. `0.2.0` (no leading `v`).
   - `dry_run`: leave false. Set true if you want to rehearse without
     publishing — the workflow will validate, build, and smoke-test, but
     skip the push, publish, tag, release, and prod-push steps.

5. The workflow takes ~5 minutes. Watch it; if a pre-publish step
   fails, no side effects (re-run safely). If a post-publish step
   fails, see "Recovery" below.

6. After it completes:
   - npm: `npm i -g @zwaggen/cli@<version>` works.
   - npm: `npx @zwaggen/web@<version>` works.
   - GitHub: a new tag `v<version>` and Release exist.
   - `play.zwaggen.com`: CF Pages picks up the `production` push within
     ~2 minutes; verify the deploy in the CF Pages dashboard.
   - `main` has a `release: v<version>` commit at the top.

7. Update `docs/TODO.md` with anything that shipped in this release.

## Failure semantics

- **Pre-publish (validate, CI-green check, bump, build, smoke).** Any
  failure aborts cleanly — nothing on npm, no tag, `production`
  untouched. The bump commit may be on `main` (if step 8 ran). Re-run
  the workflow with the same `version`; idempotent steps (bump,
  changelog, commit) are no-ops on retry. When re-running after a
  pre-publish failure, the workflow's CI-green check now points at the
  bump commit on main. That commit triggered a fresh test.yml run;
  wait for it to go green before re-dispatching, or the workflow will
  fail at the CI-green step.

- **Post-publish (publish, tag, release, prod-push).** Once npm has the
  version, it can't be reused. Do NOT re-run the workflow with the same
  version. Recover the missing step by hand:

  - Tag missing:
    `git tag -a v<version> <bump-sha> -m "Release v<version>" && git push origin v<version>`
  - GH Release missing:
    `gh release create v<version> --generate-notes`
  - `production` not updated:
    `git push origin v<version>^{commit}:production`
  - Smoke-test failure post-publish: investigate locally; if a real
    bug, cut a fix-forward `<version+0.0.1>` release.

## Dry-run example

To rehearse a release without publishing:

1. Run the workflow with `version: 0.2.0`, `dry_run: true`.
2. Workflow validates version, checks CI green, bumps + commits
   locally (NOT pushed), builds, smokes both packages.
3. No npm publish, no tag, no `main` push, no `production` push.
4. Step summary still appears with everything that would have happened.
