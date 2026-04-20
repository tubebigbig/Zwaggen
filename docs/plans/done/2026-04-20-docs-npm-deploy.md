# npm-only install docs + controlled docs deploys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the docs install + quickstart to use `npx @zwaggen/web` only, move clone instructions into the repo README, and add a manual `deploy-docs` workflow that FF-pushes `main` → `docs` so Cloudflare Pages can watch `docs` instead of auto-deploying every main push.

**Architecture:** Zero new code. A single new workflow file mirrors the FF-push pattern `release.yml` already uses for the `production` branch. Docs content rewrites are plain markdown edits across 4 VitePress pages (en + zh-TW × install + quickstart). A README "Contributing" section absorbs the clone instructions. `test.yml` grows a `pnpm --filter docs build` step so every PR catches docs build breakage before merge.

**Tech Stack:** GitHub Actions (workflow_dispatch, git push), pnpm 10, Node 20, VitePress (docs build), Cloudflare Pages (deploy target, managed via dashboard).

**Spec:** `docs/specs/active/2026-04-20-docs-npm-deploy.md`.

**Worktree convention:** Execute via `superpowers:subagent-driven-development` from `.worktrees/docs-npm-deploy` on branch `plan/docs-npm-deploy`. All commits land on that branch; per-task commits, no batching. Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File structure

**New files**
- `.github/workflows/deploy-docs.yml` — manual workflow that smoke-builds the docs and FF-pushes `main` → `docs`.

**Modified files**
- `apps/docs/installation.md` — full rewrite. npm-only path.
- `apps/docs/quickstart.md` — one step changed (`pnpm dev` → `npx @zwaggen/web`).
- `apps/docs/zh-TW/installation.md` — full rewrite, Traditional Chinese.
- `apps/docs/zh-TW/quickstart.md` — one step changed.
- `README.md` — add "Contributing / developing" section; remove or trim the existing "Dev / Build / Proxy" sections that are now user-facing-incorrect.
- `.github/workflows/test.yml` — add `pnpm --filter docs build` step so PRs catch docs build breakage.

---

## Task 1: Add the `deploy-docs` workflow

**Files:**
- Create: `.github/workflows/deploy-docs.yml`

- [ ] **Step 1: Create the workflow file**

Write this exact content to `.github/workflows/deploy-docs.yml`:

```yaml
name: deploy-docs

on:
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: deploy-docs
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout main at full depth
        uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Capture deploy SHA
        id: sha
        run: |
          SHA=$(git rev-parse HEAD)
          echo "sha=$SHA" >> "$GITHUB_OUTPUT"
          echo "DEPLOY_SHA=$SHA" >> "$GITHUB_ENV"
          echo "Deploy SHA: $SHA"

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Smoke-build docs
        run: pnpm --filter docs build

      - name: Configure git author
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

      - name: FF-push main → docs
        run: |
          if ! git push origin HEAD:docs; then
            echo "push rejected; pulling --rebase docs and retrying once"
            git fetch origin docs
            git pull --rebase origin docs
            git push origin HEAD:docs
          fi

      - name: Step summary
        if: always()
        run: |
          {
            echo "## Docs deploy"
            echo ""
            echo "- SHA: \`${DEPLOY_SHA}\`"
            echo "- Branch: \`docs\`"
            echo "- Cloudflare Pages dashboard: https://dash.cloudflare.com"
          } >> "$GITHUB_STEP_SUMMARY"
```

Key decisions encoded in this workflow:
- `workflow_dispatch` only — no event-based auto-deploy. Mirrors the spec's trigger decision.
- `concurrency.group: deploy-docs` with `cancel-in-progress: false` serialises concurrent clicks (same shape as `release.yml`'s `release` group).
- `permissions: contents: write` is the minimum needed to push the `docs` branch.
- The smoke-build (`pnpm --filter docs build`) runs BEFORE the push. A broken build aborts before `docs` moves. This protects the live site from a bad SHA.
- The FF-push fallback (`pull --rebase + retry once`) exactly mirrors `release.yml`'s push-to-main step. Handles the rare case where someone force-pushed `docs` between the checkout and the push.
- No Cloudflare credentials anywhere. CF Pages picks up the branch via its git integration.

- [ ] **Step 2: Validate the YAML locally**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-docs.yml'))"
```
Expected: exits 0 with no output. This catches obvious indent bugs before the file lands.

If `python3` is not available, use `node`:
```bash
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy-docs.yml','utf8'))"
```
(js-yaml is a transitive dependency of some workspaces; if it's not resolvable, skip this check — GitHub will reject malformed YAML at dispatch time.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-docs.yml
git commit -m "$(cat <<'EOF'
feat(ci): add deploy-docs workflow for manual docs deploys

On workflow_dispatch, smoke-builds apps/docs then FF-pushes
main → docs. Cloudflare Pages watches the docs branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rewrite `apps/docs/installation.md` (English)

**Files:**
- Modify: `apps/docs/installation.md` — full replacement.

- [ ] **Step 1: Replace the file content**

Overwrite `apps/docs/installation.md` with:

```markdown
---
description: How to run Zwaggen locally with a single npx command.
---

# Installation & Requirements

::: tip Don't want to install?
[**Try the playground at play.zwaggen.com**](https://play.zwaggen.com) — same app, no install, no proxy server. Your specs stay in your browser. Come back here when you want to test CORS-locked APIs or work fully offline.
:::

## Prerequisites

- **Node.js ≥ 20.** Check with `node --version`. Install from [nodejs.org](https://nodejs.org) or via `nvm`.
- **A modern browser.** Chromium-based (Chrome, Edge, Brave, Arc) or current Firefox. Safari is unsupported — it lacks some of the `showOpenFilePicker` / `showSaveFilePicker` APIs the spec-versioning flow relies on; a fallback upload/download path works, but the file-handle flow does not.

## Run Zwaggen

```bash
npx @zwaggen/web
```

That's it. `npx` downloads the published package, serves the pre-built SPA via `sirv` at `http://127.0.0.1:4173`, and opens the URL in your default browser.

### Flags

```bash
npx @zwaggen/web --port 8080        # custom port
npx @zwaggen/web --host 0.0.0.0     # bind all interfaces (LAN access)
npx @zwaggen/web --no-open          # don't auto-open browser
npx @zwaggen/web --help             # show all options
```

Stop the server with `Ctrl+C`.

## Run the CLI

```bash
npx @zwaggen/cli --help
```

`@zwaggen/cli` is a companion tool for batch-running requests and diffing specs. See the [CLI guide](/guide/cli) for details.

## Optional: CORS proxy

If you're hitting APIs that don't send permissive CORS headers, you'll need a local proxy. `@zwaggen/proxy` is coming soon as an npm package; in the meantime, you can run your own CORS proxy or run the bundled one by cloning the repo (see the repo `README.md` for contributor setup). Point the Zwaggen proxy setting at your proxy's URL. See [CORS Proxy](/guide/cors-proxy) for details.

## Troubleshooting

- **`unsupported engine`** warning on install — check Node ≥ 20 with `node --version`.
- **`EADDRINUSE`** — port 4173 is taken. Use `npx @zwaggen/web --port <n>` to pick another.
- **`showOpenFilePicker is not a function`** — you're on a browser without the File System Access API. Firefox is fine for in-memory use; for the "save to disk" file-handle flow, use a Chromium browser.
- **Browser didn't open** — check for `npx @zwaggen/web --no-open` in your shell history; without `--no-open`, the CLI auto-opens.
```

- [ ] **Step 2: Build the docs site locally to catch broken links**

Run:
```bash
pnpm --filter docs build
```
Expected: completes without "dead link" errors. Note that `vitepress` has `ignoreDeadLinks: false` in config, so any `[text](/path)` that doesn't resolve will fail the build.

If the build flags a dead link (likely `/guide/cli` if that page isn't a sibling), remove that one link, leaving the surrounding prose intact. Don't invent link targets.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/installation.md
git commit -m "$(cat <<'EOF'
docs: rewrite installation page for npx @zwaggen/web

Drop the clone + pnpm + git prereqs. Single code block
(npx @zwaggen/web) is now the only install path. Clone
instructions moved to the repo README.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update `apps/docs/quickstart.md` (English)

**Files:**
- Modify: `apps/docs/quickstart.md` — one step changed (lines 18-22).

- [ ] **Step 1: Apply the edit**

In `apps/docs/quickstart.md`, replace the block:

```markdown
## 1. Open the app

\`\`\`bash
pnpm dev
\`\`\`

Open the printed URL. You'll see an empty spec with "My API" as the default title.
```

with:

```markdown
## 1. Open the app

\`\`\`bash
npx @zwaggen/web
\`\`\`

This starts a local server at `http://127.0.0.1:4173` and opens your browser. You'll see an empty spec with "My API" as the default title.
```

(Remove the escaping backticks when you apply — they're only used above to show the fenced block inside a markdown plan.)

Use the `Edit` tool with an `old_string` of exactly the existing block (lines 18-24 of the current file) and `new_string` of the replacement above. Nothing else on the page changes.

- [ ] **Step 2: Build the docs**

Run:
```bash
pnpm --filter docs build
```
Expected: clean build, no dead link warnings.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/quickstart.md
git commit -m "$(cat <<'EOF'
docs(quickstart): use npx @zwaggen/web instead of pnpm dev

Step 1 of the quickstart now matches the updated installation page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite `apps/docs/zh-TW/installation.md` (Traditional Chinese)

**Files:**
- Modify: `apps/docs/zh-TW/installation.md` — full replacement.

- [ ] **Step 1: Replace the file content**

Overwrite `apps/docs/zh-TW/installation.md` with:

```markdown
---
description: 用一行 npx 指令在本機跑 Zwaggen。
---

# 安裝與環境需求

::: tip 不想安裝？
[**直接到 play.zwaggen.com 玩玩看**](https://play.zwaggen.com) — 同一個 App，不用安裝，也不提供 proxy 伺服器。你的規格只存在自己的瀏覽器裡。如果你需要測試被 CORS 封鎖的 API，或是想完全離線使用，再回到這頁照著安裝就好。
:::

## 先決條件

- **Node.js ≥ 20。** 用 `node --version` 確認版本。可以從 [nodejs.org](https://nodejs.org) 下載，或透過 `nvm` 安裝。
- **現代瀏覽器。** 以 Chromium 為核心的瀏覽器（Chrome、Edge、Brave、Arc）或最新的 Firefox 都可以。Safari 不支援 — 它沒有規格版本流程會用到的 `showOpenFilePicker` / `showSaveFilePicker` API；走上傳／下載的備援路徑仍然可以用，但依賴檔案控制代碼（file handle）的流程就會失效。

## 跑起來

```bash
npx @zwaggen/web
```

就這樣。`npx` 會下載已發佈的套件，用 `sirv` 在 `http://127.0.0.1:4173` 提供預先建置好的 SPA，然後在你預設的瀏覽器裡打開它。

### 選項

```bash
npx @zwaggen/web --port 8080        # 自訂埠號
npx @zwaggen/web --host 0.0.0.0     # 綁定所有網路介面（允許 LAN 連線）
npx @zwaggen/web --no-open          # 不要自動開啟瀏覽器
npx @zwaggen/web --help             # 顯示所有選項
```

按 `Ctrl+C` 停止伺服器。

## 跑 CLI

```bash
npx @zwaggen/cli --help
```

`@zwaggen/cli` 是用來批次執行請求、比對規格的搭配工具。詳情請見 [CLI 指南](/zh-TW/guide/cli)。

## 選配：CORS proxy

如果你要打的 API 沒有送寬鬆的 CORS 標頭，你會需要一個本機 proxy。`@zwaggen/proxy` 之後會以 npm 套件的形式發佈；目前你可以自己跑一個 CORS proxy，或 clone 這個 repo 後跑裡面附的 proxy（做法請見 repo `README.md` 的貢獻者章節）。把 Zwaggen 的 proxy 設定指到你的 proxy 網址就行。詳情請見 [CORS Proxy](/zh-TW/guide/cors-proxy)。

## 疑難排解

- **安裝時出現 `unsupported engine` 警告** — 用 `node --version` 確認 Node ≥ 20。
- **`EADDRINUSE`** — 4173 埠已被佔用。改用 `npx @zwaggen/web --port <n>` 挑一個別的。
- **`showOpenFilePicker is not a function`** — 你的瀏覽器不支援 File System Access API。Firefox 純粹在記憶體裡操作沒有問題；如果需要「存到磁碟」的檔案控制代碼流程，請改用 Chromium 系列的瀏覽器。
- **瀏覽器沒有自動開啟** — 檢查你的 shell 歷史是不是有用到 `--no-open`；如果沒有加這個旗標，CLI 預設會自己開。
```

- [ ] **Step 2: Build the docs**

Run:
```bash
pnpm --filter docs build
```
Expected: clean build. If a zh-TW link is dead (e.g. `/zh-TW/guide/cli`), drop that link and keep the surrounding sentence.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/zh-TW/installation.md
git commit -m "$(cat <<'EOF'
docs(zh-TW): rewrite installation page for npx @zwaggen/web

Traditional Chinese mirror of the English rewrite in the prior commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `apps/docs/zh-TW/quickstart.md`

**Files:**
- Modify: `apps/docs/zh-TW/quickstart.md` — one step changed (lines 18-24).

- [ ] **Step 1: Apply the edit**

In `apps/docs/zh-TW/quickstart.md`, replace the block:

```markdown
## 1. 開啟 App

\`\`\`bash
pnpm dev
\`\`\`

打開印出的網址。你會看到一份空的規格，預設標題是「My API」。
```

with:

```markdown
## 1. 開啟 App

\`\`\`bash
npx @zwaggen/web
\`\`\`

指令會在 `http://127.0.0.1:4173` 啟動本機伺服器，並開啟你的瀏覽器。你會看到一份空的規格，預設標題是「My API」。
```

(Remove the escaping backticks when applying.)

- [ ] **Step 2: Build the docs**

Run:
```bash
pnpm --filter docs build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/zh-TW/quickstart.md
git commit -m "$(cat <<'EOF'
docs(zh-TW/quickstart): use npx @zwaggen/web

Mirror the English quickstart change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `README.md` with a Contributing section

**Files:**
- Modify: `README.md` — full replacement.

- [ ] **Step 1: Replace the file content**

The current `README.md` is a stub with user-facing `pnpm dev` instructions. Since those moved to `apps/docs/` (and were just replaced with `npx` commands), the README can now own the contributor-facing story.

Overwrite `README.md` with:

```markdown
# Zwaggen

Typed API spec builder + runtime tester. Combines Postman (request testing), Swagger (API docs), and Zod (runtime type validation) into one browser app.

- **App:** [play.zwaggen.com](https://play.zwaggen.com) — hosted playground, no install.
- **Local install:** `npx @zwaggen/web` — see [docs.zwaggen.com/installation](https://docs.zwaggen.com/installation).
- **Docs:** [docs.zwaggen.com](https://docs.zwaggen.com).
- **CLI:** `npx @zwaggen/cli --help`.

## Contributing / running from source

For people who want to hack on Zwaggen itself. Users should use the npm packages above.

**Prerequisites:** Node ≥ 20, pnpm ≥ 10, git, a Chromium browser.

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
```

**Run the web app in dev mode:**

```bash
pnpm dev
```

Vite starts on `http://localhost:5173`.

**Run the docs site in dev mode:**

```bash
pnpm docs:dev
```

VitePress starts on `http://localhost:5174` by default.

**Run the bundled CORS proxy:**

```bash
pnpm --filter @zwaggen/proxy start
```

**Validate changes:**

```bash
pnpm -r lint      # tsc --noEmit across every workspace
pnpm -r test      # vitest across every workspace
pnpm --filter @zwaggen/web e2e   # Playwright e2e
```

**Project invariants:** See `docs/rules/` and `CLAUDE.md` at the repo root.

**Release & deploy flow:** `docs/plans/done/2026-04-19-release-deploy-flow.md` documents the `release.yml` workflow. The `docs/` site is deployed via a separate `deploy-docs.yml` workflow that FF-pushes `main` → `docs`; Cloudflare Pages watches the `docs` branch.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): rewrite for npm-first users + add contributor section

The old README had user-facing pnpm dev instructions that
contradicted the new installation page. Users now get the npx
story; clone + pnpm instructions live here for contributors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add `pnpm --filter docs build` to the CI test workflow

**Files:**
- Modify: `.github/workflows/test.yml` — add one step.

- [ ] **Step 1: Read the current workflow**

Read `.github/workflows/test.yml`. You'll see a single job that runs install + lint + test across the workspace. We want to add a docs build step right after the existing test run, so PRs that touch `apps/docs/` catch build breakage before merge.

- [ ] **Step 2: Add the step**

Use `Edit` to insert, directly after the existing test step (whatever runs `pnpm -r test` or equivalent), a new step:

```yaml
      - name: Build docs
        run: pnpm --filter docs build
```

Match the indentation of the surrounding steps (likely 6 spaces). Do not restructure the rest of the file.

- [ ] **Step 3: Validate the YAML**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/test.yml'))"
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "$(cat <<'EOF'
ci: add docs build to test.yml

Catches VitePress build failures (bad frontmatter, dead links, stale
mermaid syntax) on every PR that touches apps/docs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Ship checklist (post-merge, in order)

These steps are NOT part of the 7 TDD tasks above. They happen after the branch merges to `main`.

1. FF-merge `plan/docs-npm-deploy` to `main`. Push origin.
2. In the GitHub Actions tab, run the `deploy-docs` workflow manually — this creates the `docs` branch by pushing `main`'s HEAD to it. Verify the job completes green.
3. In the Cloudflare Pages dashboard, open the docs project. Settings → Builds & deployments → Production branch → change from `main` to `docs`. Save.
4. Trigger one more `deploy-docs` run (or wait for the next intentional deploy). Cloudflare will rebuild from the `docs` branch.
5. Verify `docs.zwaggen.com` is live and shows the new install page with the `npx @zwaggen/web` code block.
6. Move the spec + plan from `active/` to `done/`, tick the TODO entry on main.
7. Update the auto-memory entry `project_live_urls.md` to reflect: docs.zwaggen.com now deploys from the `docs` branch, triggered by workflow_dispatch.
8. Verify the rollback path once: force-push `docs` backwards to the prior SHA, confirm CF re-deploys the older content, then force-push back to the intended tip. Document the outcome for future reference.

## Self-review notes

- **Spec coverage check:**
  - Spec §"Deploy workflow" → Task 1 ✅
  - Spec §"Docs content rewrite: installation.md" → Task 2 ✅
  - Spec §"Docs content rewrite: quickstart.md" → Task 3 ✅
  - Spec §"Docs content rewrite: zh-TW/*" → Tasks 4, 5 ✅
  - Spec §"README.md — add a Contributing / developing section" → Task 6 ✅
  - Spec §"Testing: add `pnpm --filter docs build` to test.yml" → Task 7 ✅
  - Spec §"Coordination with the current deploy" + "Edge cases" → captured in the Ship checklist and in Task 1's workflow design comments.
- **Placeholder scan:** no TBDs, no "implement later", no "similar to Task N" — every code block is complete.
- **Type consistency:** no types here (CI + docs). Workflow file names, branch names, and commit trailers are consistent across all tasks.
