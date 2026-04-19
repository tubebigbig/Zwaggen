# Release & Deploy Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@zwaggen/cli` and `@zwaggen/web` to npm, gate `play.zwaggen.com` deploys behind a `production` branch, and provide a single `workflow_dispatch` action that does the whole release end-to-end with safety checks.

**Architecture:** A `release.yml` GitHub Actions workflow drives everything. Logic with non-trivial branching lives in small JS/shell helpers under `scripts/release/` (testable in isolation with vitest); the YAML is a thin orchestrator. `@zwaggen/core` is bundled into the cli build via `tsup --noExternal` so it stays private. `apps/web` is renamed to `@zwaggen/web` and gains a `bin/zwaggen-web.js` wrapper that boots the SPA via `sirv` and opens the user's browser via `open`. Push-to-`main` happens BEFORE publish (fail-fast gate); push-to-`production` happens AFTER tag (CF Pages picks it up).

**Tech Stack:** pnpm 10, Node 20, tsup (cli bundling), Vite (web bundling), vitest (tests), `sirv` + `open` (runtime), `gh` CLI (release + API queries).

**Spec:** `docs/specs/active/2026-04-19-release-deploy-flow.md`.

**Worktree convention:** Execute via `superpowers:subagent-driven-development` from a worktree at `.worktrees/release-deploy-flow` on branch `plan/release-deploy-flow`. All commits land on that branch; per-task commits, no batching. Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Phase 1 — Foundations

### Task 1: Add LICENSE (MIT)

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create the LICENSE file**

```
MIT License

Copyright (c) 2026 Victor Liang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Verify the file is at repo root**

Run: `ls LICENSE && head -1 LICENSE`
Expected output:
```
LICENSE
MIT License
```

- [ ] **Step 3: Commit**

```bash
git add LICENSE
git commit -m "$(cat <<'EOF'
chore: add MIT LICENSE

Required before publishing scoped packages to npm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add CHANGELOG.md scaffold

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create the CHANGELOG with header and one placeholder section**

```markdown
# Changelog

All notable changes to Zwaggen are recorded here. The release workflow
(`.github/workflows/release.yml`) prepends a new section per dispatched
version; between releases, hand-edit prior sections to refine the notes.

## Unreleased

_(empty — next release will replace this section with `## v<version> — YYYY-MM-DD`.)_
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore: add CHANGELOG scaffold

Release workflow prepends per-version sections; hand-editable between
releases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Make `@zwaggen/cli` publishable; bundle `@zwaggen/core`

### Task 3: Add publishing metadata to `packages/cli/package.json`

**Files:**
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Update package.json with publish metadata**

Replace the entire file with:

```json
{
  "name": "@zwaggen/cli",
  "version": "0.1.0",
  "description": "Zwaggen CI CLI — batch run + diff API specs (zwag)",
  "license": "MIT",
  "author": "Victor Liang",
  "homepage": "https://docs.zwaggen.com",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/victorliang/Zwaggen.git",
    "directory": "packages/cli"
  },
  "keywords": ["zwaggen", "openapi", "api", "ci", "cli", "diff", "smoke-test"],
  "type": "module",
  "bin": { "zwag": "./bin/zwag.js" },
  "files": ["bin", "dist", "README.md"],
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "lint": "tsc --noEmit",
    "dev": "tsx src/cli.ts"
  },
  "devDependencies": {
    "@zwaggen/core": "workspace:*",
    "@types/node": "^20.14.10",
    "tsup": "^8.2.2",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3",
    "vitest": "^2.0.3"
  }
}
```

Notes:
- `@zwaggen/core` moved from `dependencies` to `devDependencies`. It's only needed at build time — the bundle inlines it (configured in Task 5). Published consumers won't try to install it.
- `dependencies` block is removed entirely (`commander` is also bundled by tsup automatically since the cli is a single-binary bundle; verified in Task 6).
- `"build": "tsup"` (no inline args) — flags move to `tsup.config.ts` in Task 5.
- `"publishConfig.provenance": true` enables npm SLSA attestation.
- Repository URL assumes `github.com/victorliang/Zwaggen`. If the repo lives elsewhere (different owner/name), grep for `victorliang/Zwaggen` across this plan and adjust everywhere before committing — Tasks 3, 7, 15, and 18 reference it.

- [ ] **Step 2: Verify the JSON parses**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('packages/cli/package.json','utf8')).name)"`
Expected output: `@zwaggen/cli`

- [ ] **Step 3: Commit (do not install yet — pnpm install runs in Task 5 after tsup config exists)**

```bash
git add packages/cli/package.json
git commit -m "$(cat <<'EOF'
feat(cli): add publish metadata for @zwaggen/cli

Move @zwaggen/core to devDependencies (will be bundled into dist via
tsup --noExternal in next commit). Drop runtime dependencies block —
commander gets inlined too.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verify the dependency move doesn't break existing dev workflow

**Files:**
- (no changes — verification only)

- [ ] **Step 1: Reinstall workspace**

Run: `pnpm install --frozen-lockfile=false`
Expected: completes without errors. May report changes to `pnpm-lock.yaml`.

- [ ] **Step 2: Verify @zwaggen/core is still resolvable from cli**

Run: `node -e "import('@zwaggen/core').then(m => console.log('ok:', Object.keys(m).slice(0,3)))" --input-type=module` from `packages/cli/`.

```bash
cd packages/cli && node --input-type=module -e "import('@zwaggen/core').then(m => console.log('ok:', Object.keys(m).slice(0,3)))" && cd ../..
```

Expected: `ok: [ ... ]` (some symbol names from core).

- [ ] **Step 3: Verify existing cli tests still pass against source**

Run: `pnpm --filter @zwaggen/cli test`
Expected: all tests green (devDep resolution still works).

- [ ] **Step 4: Stage lockfile changes if any, commit**

```bash
git add pnpm-lock.yaml
git diff --cached --quiet || git commit -m "$(cat <<'EOF'
chore: refresh lockfile after cli dep reorg

@zwaggen/core moved cli dependencies → devDependencies.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(If the lockfile didn't change, the conditional commit is a no-op — safe.)

---

### Task 5: Create `packages/cli/tsup.config.ts` to bundle `@zwaggen/core`

**Files:**
- Create: `packages/cli/tsup.config.ts`

- [ ] **Step 1: Create tsup config**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node20',
  platform: 'node',
  // Bundle workspace packages (otherwise consumers would need them at runtime).
  noExternal: [/^@zwaggen\//],
  // Commander has no platform-specific bits; safe to inline.
  splitting: false,
  sourcemap: false,
  clean: true,
});
```

- [ ] **Step 2: Build cli with new config**

Run: `pnpm --filter @zwaggen/cli build`
Expected: `dist/cli.js` produced. Build output mentions bundling.

- [ ] **Step 3: Inspect the bundle to confirm core is inlined**

Run: `grep -c "from '@zwaggen/core'" packages/cli/dist/cli.js || echo "0 (good)"`
Expected: `0 (good)` — no remaining import of `@zwaggen/core` in the built file.

Also confirm a known core symbol is present:
Run: `grep -c "function diffSpec\|export.*diffSpec\|diffSpec(" packages/cli/dist/cli.js`
Expected: `1` or higher (the symbol from `@zwaggen/core` is now inlined).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/tsup.config.ts packages/cli/dist
git rm --cached -r packages/cli/dist 2>/dev/null || true
git add packages/cli/tsup.config.ts
git commit -m "$(cat <<'EOF'
build(cli): bundle @zwaggen/core via tsup --noExternal

Move tsup options out of package.json into tsup.config.ts; force
bundling of all @zwaggen/* workspace packages so dist/cli.js is
runtime-self-contained.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Note: `dist/` should already be gitignored. The `git rm --cached` line is defensive.)

---

### Task 6: Verify cli runs standalone (no node_modules/@zwaggen/core)

**Files:**
- (no changes — verification only)

- [ ] **Step 1: Pack the cli as a tarball**

```bash
cd packages/cli
pnpm pack
ls -la zwaggen-cli-0.1.0.tgz
cd ../..
```

Expected: tarball exists, ~50–200KB.

- [ ] **Step 2: Install the tarball in a fresh temp directory**

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
TARBALL="$REPO_ROOT/packages/cli/zwaggen-cli-0.1.0.tgz"
TMPDIR=$(mktemp -d)
cd "$TMPDIR"
npm init -y >/dev/null
npm install "$TARBALL"
ls node_modules/@zwaggen/ 2>/dev/null || echo "no @zwaggen scope subdir (good)"
ls node_modules/@zwaggen/cli
echo "--- node_modules/@zwaggen/cli/package.json deps:"
cat node_modules/@zwaggen/cli/package.json | grep -A2 '"dependencies"' || echo "(no dependencies block — perfect)"
```

Expected:
- `node_modules/@zwaggen/cli/` exists.
- No `node_modules/@zwaggen/core` was installed (consumer doesn't need it).
- `node_modules/@zwaggen/cli/package.json` has no `dependencies` block (or it's empty).

- [ ] **Step 3: Run the cli's --help from the temp install**

```bash
node node_modules/@zwaggen/cli/bin/zwag.js --help
```

Expected: full help text, no `Cannot find module '@zwaggen/core'` errors.

- [ ] **Step 4: Run a real diff against the fixtures (proves core code is actually inlined and works)**

```bash
node node_modules/@zwaggen/cli/bin/zwag.js diff \
  "$REPO_ROOT/packages/cli/tests/fixtures/spec-a.json" \
  "$REPO_ROOT/packages/cli/tests/fixtures/spec-a.json"
echo "exit: $?"
```

Expected: exits 0; prints "no breaking changes" or similar success message.

- [ ] **Step 5: Clean up temp**

```bash
rm -rf "$TMPDIR"
rm "$TARBALL"
```

- [ ] **Step 6: No commit (verification only)**

If any step in 2–4 failed, debug `tsup.config.ts` before proceeding. Likely cause: a transitive workspace import not matched by the `noExternal` regex.

---

## Phase 3 — Rename `web` → `@zwaggen/web`; update filter references

### Task 7: Rename `apps/web` package + add publish metadata + bin field

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Replace apps/web/package.json**

```json
{
  "name": "@zwaggen/web",
  "version": "0.1.0",
  "description": "Zwaggen web app — visual API spec designer + runner. Run with `npx @zwaggen/web`.",
  "license": "MIT",
  "author": "Victor Liang",
  "homepage": "https://docs.zwaggen.com",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/victorliang/Zwaggen.git",
    "directory": "apps/web"
  },
  "keywords": ["zwaggen", "openapi", "api", "spec", "designer", "playground"],
  "type": "module",
  "bin": { "zwaggen-web": "./bin/zwaggen-web.js" },
  "files": ["bin", "dist", "README.md"],
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:vite": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "e2e": "playwright test",
    "e2e:screenshots": "SCREENSHOTS=1 playwright test docs-screenshots --reporter=list",
    "prepublishOnly": "pnpm build"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-dropdown-menu": "^2.1.1",
    "@radix-ui/react-tooltip": "^1.1.1",
    "i18next": "^23.16.8",
    "idb-keyval": "^6.2.1",
    "jszip": "^3.10.1",
    "open": "^10.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-i18next": "^14.1.3",
    "sirv": "^2.0.4",
    "yaml": "^2.5.0",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vitest": "^2.0.3"
  }
}
```

Key changes:
- `name`: `web` → `@zwaggen/web`.
- `private` removed.
- Added `description`, `license`, `author`, `homepage`, `repository`, `keywords`, `publishConfig`, `bin`, `files`.
- Added `sirv` and `open` to runtime `dependencies` (for the wrapper, created in Task 11).
- Added `prepublishOnly` script (runs `pnpm build` before publish — defensive, the workflow already builds explicitly but this protects local `pnpm publish` invocations too).

- [ ] **Step 2: Verify JSON parses**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('apps/web/package.json','utf8')).name)"`
Expected output: `@zwaggen/web`

- [ ] **Step 3: Reinstall (sirv + open will be added)**

Run: `pnpm install --frozen-lockfile=false`
Expected: succeeds, lockfile updates with sirv + open.

- [ ] **Step 4: Commit (filter references will break here — fixed in Task 8)**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(web): rename web → @zwaggen/web; add publish metadata + bin

Adds sirv + open as runtime deps for the npx wrapper (script lands in
later task). pnpm --filter web invocations will break until Task 8
updates them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Audit and update every `pnpm --filter web` reference

**Files:**
- Modify: `package.json` (root)
- Modify: `.github/workflows/test.yml`
- Modify: `apps/docs/installation.md`
- Modify: `apps/docs/zh-TW/installation.md`
- Modify: `docs/deploy.md`

- [ ] **Step 1: Update root `package.json` `dev` script**

In `package.json`, change line 6:

```diff
-    "dev": "pnpm --filter web dev",
+    "dev": "pnpm --filter @zwaggen/web dev",
```

- [ ] **Step 2: Update `.github/workflows/test.yml`**

Two occurrences to change. In `.github/workflows/test.yml`:

```diff
-      - name: typecheck (web)
-        run: pnpm --filter web exec tsc -b
+      - name: typecheck (web)
+        run: pnpm --filter @zwaggen/web exec tsc -b

-      - name: test (web)
-        run: pnpm --filter web test
+      - name: test (web)
+        run: pnpm --filter @zwaggen/web test
```

- [ ] **Step 3: Update `apps/docs/installation.md`**

Find the line containing `pnpm --filter web install --ignore-scripts` and change `web` → `@zwaggen/web`.

- [ ] **Step 4: Update `apps/docs/zh-TW/installation.md`**

Same change as Step 3, in the Chinese-language file.

- [ ] **Step 5: Update `docs/deploy.md`**

Replace every `pnpm --filter web …` invocation with `pnpm --filter @zwaggen/web …`. There are at least four occurrences (CF Pages build command on line ~31; reproduction recipes around lines 75–78; possibly a comment line referencing the build script). Use this command to find every match in active docs:

```bash
git grep -n "pnpm --filter web" -- 'docs/deploy.md'
```

Edit each line.

Verify all active references replaced:
```bash
git grep -n "pnpm --filter web" -- ':!docs/plans/done' ':!docs/specs/done'
```
Expected: no output (zero matches outside historical archives).

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/test.yml apps/docs/installation.md apps/docs/zh-TW/installation.md docs/deploy.md
git commit -m "$(cat <<'EOF'
chore: update --filter web → --filter @zwaggen/web

Active references only — historical docs/plans/done and docs/specs/done
keep their original commands as immutable history.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Verify root scripts + CI workflow still work end-to-end

**Files:**
- (no changes — verification only)

- [ ] **Step 1: Root build**

Run: `pnpm build`
Expected: all workspaces build successfully (apps/web, apps/docs, packages/*).

- [ ] **Step 2: Root test**

Run: `pnpm test`
Expected: all test suites green.

- [ ] **Step 3: Root lint**

Run: `pnpm lint`
Expected: all type-check passes.

- [ ] **Step 4: Verify `pnpm dev` script resolves**

Run: `pnpm dev --help 2>&1 | head -5` (or `pnpm --filter @zwaggen/web dev --help` directly).
Expected: vite shows usage / starts. We don't need to leave it running — just verify the filter resolves.

- [ ] **Step 5: No commit (verification only)**

If any step fails, the most likely cause is a missed `--filter web` reference. Re-run the grep in Task 8 Step 5.

---

## Phase 4 — Web app runtime wrapper

### Task 10: Create `apps/web/bin/zwaggen-web.js` wrapper script

**Files:**
- Create: `apps/web/bin/zwaggen-web.js`

- [ ] **Step 1: Create the wrapper**

```js
#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import open from 'open';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');
const distDir = resolve(__dirname, '..', 'dist');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

function printHelp() {
  console.log(`zwaggen-web v${pkg.version} — run the Zwaggen web app locally

Usage: npx @zwaggen/web [options]

Options:
  --port <n>        Port to bind (default: 4173, scans upward if busy)
  --host <addr>     Host to bind (default: 127.0.0.1)
  --no-open         Do not open browser automatically
  -h, --help        Show this help
  -v, --version     Show version

Examples:
  npx @zwaggen/web                      # http://127.0.0.1:4173, opens browser
  npx @zwaggen/web --port 8080          # custom port
  npx @zwaggen/web --host 0.0.0.0       # bind all interfaces (LAN access)
  npx @zwaggen/web --no-open            # don't auto-open browser
`);
}

function parseArgs(argv) {
  const opts = { port: 4173, host: '127.0.0.1', open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    if (a === '-v' || a === '--version') { console.log(pkg.version); process.exit(0); }
    if (a === '--no-open') { opts.open = false; continue; }
    if (a === '--port') {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        console.error(`Invalid --port value: ${v}`);
        process.exit(2);
      }
      opts.port = n;
      continue;
    }
    if (a === '--host') {
      const v = argv[++i];
      if (!v) { console.error('--host requires a value'); process.exit(2); }
      opts.host = v;
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    console.error(`Run 'npx @zwaggen/web --help' for usage.`);
    process.exit(2);
  }
  return opts;
}

function tryListen(server, port, host) {
  return new Promise((res) => {
    const onError = (err) => {
      server.removeListener('listening', onListen);
      if (err.code === 'EADDRINUSE') res(null);
      else { console.error(err); process.exit(1); }
    };
    const onListen = () => {
      server.removeListener('error', onError);
      res(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen(port, host);
  });
}

async function listenWithFallback(server, requestedPort, host) {
  if (requestedPort === 0) return tryListen(server, 0, host);
  for (let p = requestedPort; p < requestedPort + 100; p++) {
    const got = await tryListen(server, p, host);
    if (got !== null) return got;
  }
  console.error(`No free port in range ${requestedPort}–${requestedPort + 99}`);
  process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!existsSync(distDir)) {
    console.error(`Cannot find built assets at ${distDir}`);
    console.error(`If you installed from npm this is a packaging bug — please file an issue.`);
    process.exit(1);
  }

  const handler = sirv(distDir, { single: true, dev: false, etag: true });
  const server = createServer((req, res) => handler(req, res));

  const port = await listenWithFallback(server, opts.port, opts.host);
  const url = `http://${opts.host}:${port}`;
  console.log(`Zwaggen web app running at ${url}`);
  console.log(`(Press Ctrl+C to stop)`);

  if (opts.open) {
    open(url).catch(() => {
      console.log(`(Could not open browser automatically — visit ${url} manually.)`);
    });
  }

  const shutdown = () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Make it executable (best-effort; npm fixes mode at install time, but local invocation needs +x)**

```bash
chmod +x apps/web/bin/zwaggen-web.js
```

- [ ] **Step 3: Build the web app so dist/ exists**

```bash
pnpm --filter @zwaggen/web build:vite
ls apps/web/dist/index.html
```

Expected: `apps/web/dist/index.html` present. (Using `build:vite` skips tsc, faster — full `build` in CI catches type errors.)

- [ ] **Step 4: Smoke-test the wrapper locally**

```bash
node apps/web/bin/zwaggen-web.js --help
```

Expected: prints help text, exits 0.

```bash
node apps/web/bin/zwaggen-web.js --version
```

Expected: prints `0.1.0`.

- [ ] **Step 5: Boot the server in the background, curl it, kill it**

```bash
node apps/web/bin/zwaggen-web.js --no-open --port 0 > /tmp/zw-web.log 2>&1 &
PID=$!
sleep 2
URL=$(grep -oE 'http://[^ ]+' /tmp/zw-web.log | head -1)
echo "URL: $URL"
curl --fail -sS "$URL" | grep -q '<div id="root"' && echo "served index ok" || (echo "FAILED" && cat /tmp/zw-web.log && false)
curl --fail -sS "$URL/some/spa/route" | grep -q '<div id="root"' && echo "spa fallback ok" || echo "FAILED spa fallback"
kill $PID
wait $PID 2>/dev/null
```

Expected:
- `URL: http://127.0.0.1:<some-port>` printed.
- `served index ok` printed.
- `spa fallback ok` printed.
- Process killed cleanly.

- [ ] **Step 6: Commit**

```bash
git add apps/web/bin/zwaggen-web.js
git commit -m "$(cat <<'EOF'
feat(web): add npx-runnable bin/zwaggen-web.js wrapper

Static-server wrapper around dist/ using sirv (with SPA fallback) and
open. Defaults to 127.0.0.1:4173 with port-busy fallback. Flags:
--port, --host, --no-open, --help, --version. Clean SIGINT shutdown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Add `apps/web/README.md`

**Files:**
- Create: `apps/web/README.md`

- [ ] **Step 1: Create the README**

```markdown
# @zwaggen/web

Zwaggen web app — a visual API spec designer + runner — packaged for
zero-install local use.

## Install / run

No global install needed:

```bash
npx @zwaggen/web
```

This boots a local server (default `http://127.0.0.1:4173`) and opens
your browser. Press Ctrl+C to stop.

Or install globally:

```bash
npm i -g @zwaggen/web
zwaggen-web
```

## Options

| Flag             | Default        | Description                                    |
| ---------------- | -------------- | ---------------------------------------------- |
| `--port <n>`     | `4173`         | Port to bind. If busy, scans upward for free.  |
| `--host <addr>`  | `127.0.0.1`    | Host to bind. Use `0.0.0.0` for LAN access.    |
| `--no-open`      | (off)          | Don't auto-open browser.                       |
| `-h`, `--help`   |                | Show help.                                     |
| `-v`, `--version`|                | Print version.                                 |

## Examples

```bash
npx @zwaggen/web                 # default
npx @zwaggen/web --port 8080     # custom port
npx @zwaggen/web --host 0.0.0.0  # LAN-accessible
npx @zwaggen/web --no-open       # don't open browser
```

## What this is

The Zwaggen web app is a single-page React app — there's no backend.
Your specs and run history are stored in your browser's IndexedDB.
Closing the server doesn't lose data; reopening it on the same port
restores everything.

## Online version

The same app runs at [`play.zwaggen.com`](https://play.zwaggen.com) with
no install required. Use that if you don't want a local copy.

## Documentation

Full tutorial at [`docs.zwaggen.com`](https://docs.zwaggen.com).

## License

MIT.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/README.md
git commit -m "$(cat <<'EOF'
docs(web): add @zwaggen/web README for npm package page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Release helper scripts (testable in isolation)

### Task 12: `scripts/release/validate-version.mjs` + test

**Files:**
- Create: `scripts/release/validate-version.mjs`
- Create: `scripts/release/validate-version.test.mjs`

- [ ] **Step 1: Write the failing test first**

Create `scripts/release/validate-version.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { validateVersion, compareSemver } from './validate-version.mjs';

describe('compareSemver', () => {
  it('returns 0 for equal', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });
  it('returns positive when a > b', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareSemver('1.3.0', '1.2.99')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });
  it('returns negative when a < b', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0);
  });
});

describe('validateVersion', () => {
  it('accepts a clean semver greater than the latest tag', () => {
    expect(() => validateVersion('0.2.0', 'v0.1.0')).not.toThrow();
  });
  it('accepts any version when no prior tag', () => {
    expect(() => validateVersion('0.1.0', null)).not.toThrow();
  });
  it('rejects non-semver formats', () => {
    expect(() => validateVersion('0.2', null)).toThrow(/semver/i);
    expect(() => validateVersion('v0.2.0', null)).toThrow(/no leading v/i);
    expect(() => validateVersion('0.2.0-beta', null)).toThrow(/semver/i);
    expect(() => validateVersion('', null)).toThrow(/semver/i);
  });
  it('rejects equal-or-lower versions vs latest tag', () => {
    expect(() => validateVersion('0.1.0', 'v0.1.0')).toThrow(/greater than/i);
    expect(() => validateVersion('0.0.9', 'v0.1.0')).toThrow(/greater than/i);
  });
});
```

- [ ] **Step 2: Run the test — expect failure (module doesn't exist yet)**

Run: `pnpm exec vitest run scripts/release/validate-version.test.mjs`
Expected: FAIL — `Cannot find module './validate-version.mjs'`.

- [ ] **Step 3: Implement the module**

Create `scripts/release/validate-version.mjs`:

```js
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function validateVersion(version, latestTag) {
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`version is required (semver, e.g. 0.2.0)`);
  }
  if (version.startsWith('v')) {
    throw new Error(`version must have no leading v (got "${version}"; use "${version.slice(1)}")`);
  }
  if (!SEMVER_RE.test(version)) {
    throw new Error(`version must be plain semver MAJOR.MINOR.PATCH (got "${version}"; pre-release/build tags not supported in v1)`);
  }
  if (latestTag) {
    const prev = latestTag.replace(/^v/, '');
    if (!SEMVER_RE.test(prev)) {
      throw new Error(`latest tag "${latestTag}" is not parseable as semver — refusing to compare`);
    }
    if (compareSemver(version, prev) <= 0) {
      throw new Error(`version "${version}" must be strictly greater than latest tag "${latestTag}"`);
    }
  }
}

// CLI entrypoint: node validate-version.mjs <version> [<latest-tag-or-empty>]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , version, latestTag] = process.argv;
  try {
    validateVersion(version, latestTag || null);
    console.log(`ok: ${version}`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm exec vitest run scripts/release/validate-version.test.mjs`
Expected: PASS, all 7+ assertions green.

- [ ] **Step 5: Smoke the CLI entrypoint**

```bash
node scripts/release/validate-version.mjs 0.2.0 v0.1.0
node scripts/release/validate-version.mjs 0.1.0 v0.1.0 || echo "exit $? (expected 1)"
node scripts/release/validate-version.mjs v0.2.0 || echo "exit $? (expected 1)"
node scripts/release/validate-version.mjs 0.2.0
```

Expected: first prints `ok: 0.2.0`. Second prints error + `exit 1`. Third prints error + `exit 1`. Fourth prints `ok: 0.2.0`.

- [ ] **Step 6: Commit**

```bash
git add scripts/release/validate-version.mjs scripts/release/validate-version.test.mjs
git commit -m "$(cat <<'EOF'
feat(release): scripts/release/validate-version.mjs + tests

Pure-JS semver validation for the release workflow's version input.
Plain MAJOR.MINOR.PATCH only; must be strictly greater than latest tag.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `scripts/release/bump-versions.mjs` + test

**Files:**
- Create: `scripts/release/bump-versions.mjs`
- Create: `scripts/release/bump-versions.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/release/bump-versions.test.mjs`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bumpVersions } from './bump-versions.mjs';

describe('bumpVersions', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zw-bump-'));
    mkdirSync(join(dir, 'a'), { recursive: true });
    mkdirSync(join(dir, 'b'), { recursive: true });
    writeFileSync(join(dir, 'a', 'package.json'),
      JSON.stringify({ name: 'a', version: '0.1.0', other: 'kept' }, null, 2) + '\n');
    writeFileSync(join(dir, 'b', 'package.json'),
      JSON.stringify({ name: 'b', version: '0.1.0' }, null, 2) + '\n');
  });

  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('updates the version field in every passed package.json', () => {
    bumpVersions('0.2.0', [join(dir, 'a/package.json'), join(dir, 'b/package.json')]);
    const a = JSON.parse(readFileSync(join(dir, 'a/package.json'), 'utf8'));
    const b = JSON.parse(readFileSync(join(dir, 'b/package.json'), 'utf8'));
    expect(a.version).toBe('0.2.0');
    expect(b.version).toBe('0.2.0');
  });

  it('preserves other fields and key order', () => {
    bumpVersions('0.2.0', [join(dir, 'a/package.json')]);
    const raw = readFileSync(join(dir, 'a/package.json'), 'utf8');
    const a = JSON.parse(raw);
    expect(a.name).toBe('a');
    expect(a.other).toBe('kept');
    // version key still appears before "other"
    expect(raw.indexOf('"version"')).toBeLessThan(raw.indexOf('"other"'));
  });

  it('is idempotent — running twice with the same version is a no-op', () => {
    bumpVersions('0.2.0', [join(dir, 'a/package.json')]);
    const first = readFileSync(join(dir, 'a/package.json'), 'utf8');
    bumpVersions('0.2.0', [join(dir, 'a/package.json')]);
    const second = readFileSync(join(dir, 'a/package.json'), 'utf8');
    expect(second).toBe(first);
  });

  it('throws if a target file does not exist', () => {
    expect(() => bumpVersions('0.2.0', [join(dir, 'missing/package.json')])).toThrow();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm exec vitest run scripts/release/bump-versions.test.mjs`
Expected: FAIL — `Cannot find module './bump-versions.mjs'`.

- [ ] **Step 3: Implement**

Create `scripts/release/bump-versions.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';

export function bumpVersions(version, packageJsonPaths) {
  for (const p of packageJsonPaths) {
    const raw = readFileSync(p, 'utf8');
    const pkg = JSON.parse(raw);
    pkg.version = version;
    // Preserve trailing newline if the original had one.
    const trailingNewline = raw.endsWith('\n') ? '\n' : '';
    writeFileSync(p, JSON.stringify(pkg, null, 2) + trailingNewline);
  }
}

// CLI: node bump-versions.mjs <version> <pkg1.json> <pkg2.json> ...
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , version, ...paths] = process.argv;
  if (!version || paths.length === 0) {
    console.error('usage: node bump-versions.mjs <version> <pkg.json> [<pkg.json> ...]');
    process.exit(2);
  }
  bumpVersions(version, paths);
  console.log(`bumped ${paths.length} package.json file(s) to ${version}`);
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm exec vitest run scripts/release/bump-versions.test.mjs`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/bump-versions.mjs scripts/release/bump-versions.test.mjs
git commit -m "$(cat <<'EOF'
feat(release): scripts/release/bump-versions.mjs + tests

Idempotent version bumper that preserves field order and trailing
newline in package.json files.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: `scripts/release/update-changelog.mjs` + test

**Files:**
- Create: `scripts/release/update-changelog.mjs`
- Create: `scripts/release/update-changelog.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/release/update-changelog.test.mjs`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderEntry, prependEntry } from './update-changelog.mjs';

describe('renderEntry', () => {
  it('formats version, date, and bullet list', () => {
    const out = renderEntry('0.2.0', '2026-04-19', ['feat: a thing', 'fix: another']);
    expect(out).toContain('## v0.2.0 — 2026-04-19');
    expect(out).toContain('- feat: a thing');
    expect(out).toContain('- fix: another');
  });
  it('falls back to "Initial release" when no commits', () => {
    const out = renderEntry('0.1.0', '2026-04-19', []);
    expect(out).toMatch(/Initial release/);
  });
  it('skips merge commits', () => {
    const out = renderEntry('0.2.0', '2026-04-19', ['feat: a', 'Merge branch x', 'fix: b']);
    expect(out).toContain('- feat: a');
    expect(out).toContain('- fix: b');
    expect(out).not.toContain('Merge branch x');
  });
  it('skips prior release commits ("release: vX.Y.Z")', () => {
    const out = renderEntry('0.3.0', '2026-04-19', ['feat: thing', 'release: v0.2.0']);
    expect(out).toContain('- feat: thing');
    expect(out).not.toContain('release: v0.2.0');
  });
});

describe('prependEntry', () => {
  let dir, file;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zw-cl-'));
    file = join(dir, 'CHANGELOG.md');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('inserts after the # Changelog header on a fresh file', () => {
    writeFileSync(file, '# Changelog\n\nIntro paragraph.\n\n## Unreleased\n\n_(empty)_\n');
    prependEntry(file, '0.2.0', '2026-04-19', ['feat: x']);
    const out = readFileSync(file, 'utf8');
    expect(out.startsWith('# Changelog\n')).toBe(true);
    const headerIdx = out.indexOf('# Changelog');
    const newSecIdx = out.indexOf('## v0.2.0');
    const unreleasedIdx = out.indexOf('## Unreleased');
    expect(headerIdx).toBeLessThan(newSecIdx);
    expect(newSecIdx).toBeLessThan(unreleasedIdx);
  });

  it('throws if the file has no # Changelog header', () => {
    writeFileSync(file, 'no header here\n');
    expect(() => prependEntry(file, '0.2.0', '2026-04-19', ['x'])).toThrow(/header/i);
  });

  it('is idempotent — running twice with the same version is a no-op (does not duplicate)', () => {
    writeFileSync(file, '# Changelog\n\n');
    prependEntry(file, '0.2.0', '2026-04-19', ['feat: x']);
    const first = readFileSync(file, 'utf8');
    prependEntry(file, '0.2.0', '2026-04-19', ['feat: x']);
    const second = readFileSync(file, 'utf8');
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm exec vitest run scripts/release/update-changelog.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `scripts/release/update-changelog.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SKIP_PREFIXES = ['Merge ', 'release: v'];

function shouldKeep(subject) {
  for (const p of SKIP_PREFIXES) if (subject.startsWith(p)) return false;
  return true;
}

export function renderEntry(version, dateIso, subjects) {
  const kept = subjects.filter(shouldKeep).map((s) => `- ${s}`);
  const body = kept.length ? kept.join('\n') : '- Initial release';
  return `## v${version} — ${dateIso}\n\n${body}\n`;
}

export function prependEntry(file, version, dateIso, subjects) {
  const raw = readFileSync(file, 'utf8');
  if (!raw.startsWith('# Changelog')) {
    throw new Error(`${file} does not start with "# Changelog" header`);
  }
  const marker = `## v${version} —`;
  if (raw.includes(marker)) return; // idempotent

  const headerEnd = raw.indexOf('\n', raw.indexOf('# Changelog')) + 1;
  // Insert after the header line, preserving any intro paragraph below it.
  // Strategy: split into [header line, rest], then insert new entry as a new
  // top-of-rest section.
  const head = raw.slice(0, headerEnd);
  const rest = raw.slice(headerEnd);
  const entry = renderEntry(version, dateIso, subjects);
  const out = `${head}\n${entry}\n${rest.trimStart()}`;
  writeFileSync(file, out);
}

function commitSubjectsSince(prevTag) {
  const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
  const out = execSync(`git log ${range} --pretty=%s`, { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

// CLI: node update-changelog.mjs <changelog-file> <version> [<prev-tag>]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , file, version, prevTag] = process.argv;
  if (!file || !version) {
    console.error('usage: node update-changelog.mjs <changelog-file> <version> [<prev-tag>]');
    process.exit(2);
  }
  const dateIso = new Date().toISOString().slice(0, 10);
  const subjects = commitSubjectsSince(prevTag || '');
  prependEntry(file, version, dateIso, subjects);
  console.log(`prepended v${version} entry (${subjects.length} commit subjects considered)`);
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm exec vitest run scripts/release/update-changelog.test.mjs`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/update-changelog.mjs scripts/release/update-changelog.test.mjs
git commit -m "$(cat <<'EOF'
feat(release): scripts/release/update-changelog.mjs + tests

Prepends per-version sections to CHANGELOG.md from git log subjects.
Skips merge + release: commits. Idempotent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `scripts/release/check-ci-green.sh`

**Files:**
- Create: `scripts/release/check-ci-green.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# Verifies the latest run of the test workflow on the given SHA succeeded.
# Usage: check-ci-green.sh <SHA>
# Requires: GH_TOKEN env var (auto-provided in GitHub Actions).
# Exits 0 if green, 1 otherwise.
set -euo pipefail

SHA="${1:?usage: check-ci-green.sh <SHA>}"
WORKFLOW="test.yml"

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY env var required (set by GitHub Actions; for local use export it as owner/repo)}"

echo "Checking ${WORKFLOW} on ${REPO}@${SHA}..."

CONCLUSION=$(gh api \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${SHA}&per_page=1" \
  --jq '.workflow_runs[0].conclusion // "missing"')

case "$CONCLUSION" in
  success) echo "ok: CI green on ${SHA}"; exit 0 ;;
  missing) echo "error: no ${WORKFLOW} run found for ${SHA} — push to main and wait for CI" >&2; exit 1 ;;
  *)       echo "error: ${WORKFLOW} on ${SHA} is '${CONCLUSION}', not 'success'" >&2; exit 1 ;;
esac
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/release/check-ci-green.sh
```

- [ ] **Step 3: Smoke-test against the current main HEAD (this assumes you have `gh` configured + the test workflow has run on this SHA)**

```bash
SHA=$(git rev-parse HEAD)
GITHUB_REPOSITORY="victorliang/Zwaggen" scripts/release/check-ci-green.sh "$SHA"
```

Expected (if main HEAD has a green test run): `ok: CI green on <sha>`.
If the script reports the run is missing or failed, that reflects reality — don't change the script. Skip this step's assertion if running locally without `gh` configured.

- [ ] **Step 4: Commit**

```bash
git add scripts/release/check-ci-green.sh
git commit -m "$(cat <<'EOF'
feat(release): scripts/release/check-ci-green.sh

gh-API call that asserts the test workflow's latest run on a given
SHA succeeded. Workflow uses this as the hard gate before publishing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: `scripts/release/smoke-cli.sh`

**Files:**
- Create: `scripts/release/smoke-cli.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# Pre-publish smoke test: pack the cli locally, install in a tmp dir,
# run --help and a real diff against the fixtures.
# Usage: smoke-cli.sh
# Returns 0 on success, non-zero otherwise.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI_DIR="${REPO_ROOT}/packages/cli"
FIXTURES="${CLI_DIR}/tests/fixtures"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cd "$CLI_DIR"
TARBALL=$(pnpm pack --silent | tail -1)
TARBALL_PATH="${CLI_DIR}/${TARBALL}"
if [ ! -f "$TARBALL_PATH" ]; then
  echo "error: pnpm pack did not produce a tarball" >&2
  exit 1
fi
cd "$REPO_ROOT"

cd "$TMP"
npm init -y >/dev/null
npm install --silent "$TARBALL_PATH"
echo "--- installed"
ls node_modules/@zwaggen/

# Confirm core was NOT installed as a runtime dep
if [ -d "node_modules/@zwaggen/core" ]; then
  echo "error: @zwaggen/core was installed as a runtime dep — bundle is broken" >&2
  exit 1
fi

# --help
node node_modules/@zwaggen/cli/bin/zwag.js --help > /dev/null
echo "--- --help ok"

# Real diff
node node_modules/@zwaggen/cli/bin/zwag.js diff "$FIXTURES/spec-a.json" "$FIXTURES/spec-a.json"
echo "--- diff (identical) ok, exit 0"

set +e
node node_modules/@zwaggen/cli/bin/zwag.js diff "$FIXTURES/spec-a.json" "$FIXTURES/spec-b-breaking.json"
RC=$?
set -e
if [ "$RC" -ne 1 ]; then
  echo "error: expected breaking diff to exit 1, got $RC" >&2
  exit 1
fi
echo "--- diff (breaking) exit 1 ok"

# Cleanup tarball in repo
rm -f "$TARBALL_PATH"

echo "smoke-cli: PASS"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/release/smoke-cli.sh
```

- [ ] **Step 3: Run it (proves the cli build is publishable today)**

```bash
pnpm --filter @zwaggen/cli build
scripts/release/smoke-cli.sh
```

Expected: ends with `smoke-cli: PASS`.

- [ ] **Step 4: Commit**

```bash
git add scripts/release/smoke-cli.sh
git commit -m "$(cat <<'EOF'
feat(release): scripts/release/smoke-cli.sh

Packs cli locally, installs in temp dir, runs --help + diff against
fixtures. Verifies core is bundled (not installed as runtime dep).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: `scripts/release/smoke-web.sh`

**Files:**
- Create: `scripts/release/smoke-web.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# Pre-publish smoke test: pack @zwaggen/web locally, install in a tmp dir,
# boot the wrapper, curl it, kill it.
# Usage: smoke-web.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_DIR="${REPO_ROOT}/apps/web"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"; [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null || true' EXIT

cd "$WEB_DIR"
TARBALL=$(pnpm pack --silent | tail -1)
TARBALL_PATH="${WEB_DIR}/${TARBALL}"
cd "$REPO_ROOT"

cd "$TMP"
npm init -y >/dev/null
npm install --silent "$TARBALL_PATH"
echo "--- installed"

# Boot the wrapper in background, --no-open, OS-picked port
LOG="$TMP/zw.log"
node node_modules/@zwaggen/web/bin/zwaggen-web.js --no-open --port 0 > "$LOG" 2>&1 &
PID=$!

# Wait up to 10s for the URL to appear
for i in $(seq 1 50); do
  URL=$(grep -oE 'http://[^ ]+' "$LOG" | head -1 || true)
  if [ -n "$URL" ]; then break; fi
  sleep 0.2
done
if [ -z "$URL" ]; then
  echo "error: wrapper did not print URL within 10s" >&2
  cat "$LOG" >&2
  exit 1
fi
echo "--- URL: $URL"

# Verify root and SPA fallback both serve the index
curl --fail -sS "$URL" | grep -q '<div id="root"' || { echo "error: root did not contain SPA root div" >&2; exit 1; }
curl --fail -sS "$URL/some/spa/route" | grep -q '<div id="root"' || { echo "error: SPA fallback failed" >&2; exit 1; }
echo "--- served root + spa fallback ok"

kill "$PID"
wait "$PID" 2>/dev/null || true
PID=""

rm -f "$TARBALL_PATH"
echo "smoke-web: PASS"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/release/smoke-web.sh
```

- [ ] **Step 3: Run it (build first)**

```bash
pnpm --filter @zwaggen/web build:vite
scripts/release/smoke-web.sh
```

Expected: ends with `smoke-web: PASS`.

- [ ] **Step 4: Commit**

```bash
git add scripts/release/smoke-web.sh
git commit -m "$(cat <<'EOF'
feat(release): scripts/release/smoke-web.sh

Packs @zwaggen/web locally, installs in temp dir, boots wrapper on
OS-picked port, curls index + a SPA-fallback path, kills cleanly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Wire the GitHub Actions release workflow

### Task 18: Create `.github/workflows/release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: release

on:
  workflow_dispatch:
    inputs:
      version:
        description: "semver e.g. 0.2.0 (no leading v)"
        required: true
        type: string
      dry_run:
        description: "Skip push/publish/tag/release (validate + build + smoke only)"
        required: false
        default: false
        type: boolean

permissions:
  contents: write
  id-token: write

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    env:
      VERSION: ${{ inputs.version }}
      DRY_RUN: ${{ inputs.dry_run }}
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
    steps:
      - name: Checkout main at full depth + tags
        uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Capture release SHA
        id: sha
        run: |
          SHA=$(git rev-parse HEAD)
          echo "sha=$SHA" >> "$GITHUB_OUTPUT"
          echo "RELEASE_SHA=$SHA" >> "$GITHUB_ENV"
          echo "Release SHA: $SHA"

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Validate version input vs latest tag
        run: |
          LATEST=$(git tag --list 'v*' --sort=-v:refname | head -1 || true)
          echo "Latest tag: ${LATEST:-<none>}"
          node scripts/release/validate-version.mjs "$VERSION" "$LATEST"

      - name: Verify CI is green on release SHA
        run: scripts/release/check-ci-green.sh "$RELEASE_SHA"
        # GITHUB_REPOSITORY is auto-populated by the runner.

      - name: Configure git author
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

      - name: Bump versions in apps/web + packages/cli
        run: |
          node scripts/release/bump-versions.mjs "$VERSION" \
            apps/web/package.json \
            packages/cli/package.json

      - name: Update CHANGELOG.md
        run: |
          LATEST=$(git tag --list 'v*' --sort=-v:refname | head -1 || true)
          node scripts/release/update-changelog.mjs CHANGELOG.md "$VERSION" "$LATEST"

      - name: Commit the bump
        run: |
          git add apps/web/package.json packages/cli/package.json CHANGELOG.md
          if git diff --cached --quiet; then
            echo "no changes to commit (idempotent re-run)"
          else
            git commit -m "release: v${VERSION}"
          fi

      - name: Push bump to main (fail-fast gate)
        if: ${{ inputs.dry_run != true }}
        run: |
          # Try push; on rejection, rebase once and retry. Bump is pure
          # package.json + CHANGELOG.md edits, so rebase is always trivial.
          if ! git push origin HEAD:main; then
            echo "push rejected; pulling --rebase and retrying once"
            git pull --rebase origin main
            git push origin HEAD:main
          fi

      - name: Build cli
        run: pnpm --filter @zwaggen/cli build

      - name: Build web
        run: pnpm --filter @zwaggen/web build

      - name: Pre-publish smoke (cli)
        run: scripts/release/smoke-cli.sh

      - name: Pre-publish smoke (web)
        run: scripts/release/smoke-web.sh

      - name: Publish @zwaggen/cli
        if: ${{ inputs.dry_run != true }}
        working-directory: packages/cli
        run: pnpm publish --access public --no-git-checks --provenance

      - name: Publish @zwaggen/web
        if: ${{ inputs.dry_run != true }}
        working-directory: apps/web
        run: pnpm publish --access public --no-git-checks --provenance

      - name: Tag release
        if: ${{ inputs.dry_run != true }}
        run: |
          git tag -a "v${VERSION}" -m "Release v${VERSION}"
          git push origin "v${VERSION}"

      - name: Create GitHub Release
        if: ${{ inputs.dry_run != true }}
        run: gh release create "v${VERSION}" --generate-notes --title "v${VERSION}"

      - name: FF-push to production (deploys play.zwaggen.com)
        if: ${{ inputs.dry_run != true }}
        run: git push origin HEAD:production

      - name: Step summary
        if: always()
        run: |
          {
            echo "## Release v${VERSION}"
            echo ""
            echo "- SHA: \`${RELEASE_SHA}\`"
            echo "- Dry run: \`${DRY_RUN}\`"
            if [ "${DRY_RUN}" = "false" ]; then
              echo "- npm: https://www.npmjs.com/package/@zwaggen/cli/v/${VERSION}"
              echo "- npm: https://www.npmjs.com/package/@zwaggen/web/v/${VERSION}"
              echo "- Tag: https://github.com/${GITHUB_REPOSITORY}/releases/tag/v${VERSION}"
            fi
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Validate the YAML parses**

```bash
node -e "const y=require('yaml');y.parse(require('fs').readFileSync('.github/workflows/release.yml','utf8'));console.log('ok')"
```

(If `yaml` is not in root deps, use any other YAML parser — the file is also validated by the GitHub Actions linter once pushed.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "$(cat <<'EOF'
ci: add release.yml — versioned manual release workflow

Single workflow_dispatch entry point with 'version' + 'dry_run' inputs.
Validates input, hard-fails on non-green CI, bumps + pushes-to-main as
fail-fast gate, builds + smoke-tests + publishes to npm, tags + creates
GH release, FF-pushes to production (CF Pages deploy gate).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Local rehearsal of the workflow's pure steps

**Files:**
- (no changes — verification only)

The workflow can't be fully exercised without a `workflow_dispatch`, but every pre-push step is now scriptable locally. Walk through them.

- [ ] **Step 1: Validate-version (success path)**

```bash
LATEST=$(git tag --list 'v*' --sort=-v:refname | head -1 || true)
node scripts/release/validate-version.mjs 0.2.0 "$LATEST"
```

Expected: `ok: 0.2.0`.

- [ ] **Step 2: Validate-version (rejection path)**

```bash
node scripts/release/validate-version.mjs v0.2.0 "" || echo "exit $? (expected 1)"
```

Expected: error printed, `exit 1`.

- [ ] **Step 3: Bump-versions on a copy (don't mutate real package.json)**

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/a" "$TMP/b"
echo '{"name":"a","version":"0.1.0"}' > "$TMP/a/package.json"
echo '{"name":"b","version":"0.1.0"}' > "$TMP/b/package.json"
node scripts/release/bump-versions.mjs 9.9.9 "$TMP/a/package.json" "$TMP/b/package.json"
cat "$TMP/a/package.json" "$TMP/b/package.json"
rm -rf "$TMP"
```

Expected: both files now show `"version": "9.9.9"`.

- [ ] **Step 4: Update-changelog on a copy**

```bash
TMP=$(mktemp -d)
echo "# Changelog" > "$TMP/CHANGELOG.md"
node scripts/release/update-changelog.mjs "$TMP/CHANGELOG.md" 0.2.0 ""
cat "$TMP/CHANGELOG.md"
rm -rf "$TMP"
```

Expected: file now has `## v0.2.0 — <today>` section.

- [ ] **Step 5: Smoke scripts already exercised in Tasks 16 & 17 — skip if just done.**

- [ ] **Step 6: No commit (verification only)**

If anything failed, fix the script in question before continuing — the workflow inherits these failures.

---

## Phase 7 — Documentation + handoff

### Task 20: Add `docs/release.md` (one-time setup + dispatch procedure)

**Files:**
- Create: `docs/release.md`

- [ ] **Step 1: Create the doc**

```markdown
# Release procedure

This is the maintainer's runbook for cutting a Zwaggen release. The
flow is fully manual — releases happen only when a maintainer dispatches
`.github/workflows/release.yml` from the GitHub Actions UI.

## One-time setup (do these once before the first release)

1. **Register the `@zwaggen` scope on npm.** Sign in at
   [npmjs.com](https://www.npmjs.com), create an org or personal scope
   named `zwaggen` (free tier is fine — both packages are public).

2. **Create an npm automation token.** At
   `https://www.npmjs.com/settings/<your-user>/tokens`, create a token of
   type **Automation** (works with 2FA, doesn't prompt). In the GitHub
   repo settings → Secrets and variables → Actions, add a new repo
   secret: `NPM_TOKEN` = the token value.

3. **Create the `production` branch.** From a local clone of `main`:

   ```bash
   git push origin main:production
   ```

4. **Flip the CF Pages production branch.** In the Cloudflare Pages
   dashboard for the `play.zwaggen.com` project, change "Production
   branch" from `main` → `production`. Trigger a manual rebuild from
   `production` to confirm CF Pages picks up the new branch correctly.
   Leave the `docs.zwaggen.com` project alone — it keeps deploying from
   `main`.

5. **Confirm the LICENSE and CHANGELOG.md files exist at repo root**
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
  changelog, commit) are no-ops on retry.

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
```

- [ ] **Step 2: Commit**

```bash
git add docs/release.md
git commit -m "$(cat <<'EOF'
docs: add docs/release.md runbook

One-time setup (npm scope, NPM_TOKEN, production branch, CF Pages
flip) plus the dispatch procedure for cutting releases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Move spec to done; update TODO.md; add follow-up TODOs

**Files:**
- Move: `docs/specs/active/2026-04-19-release-deploy-flow.md` → `docs/specs/done/2026-04-19-release-deploy-flow.md`
- Move: `docs/plans/active/2026-04-19-release-deploy-flow.md` → `docs/plans/done/2026-04-19-release-deploy-flow.md`
- Modify: `docs/TODO.md`

- [ ] **Step 1: Move spec and plan to done/**

```bash
git mv docs/specs/active/2026-04-19-release-deploy-flow.md docs/specs/done/2026-04-19-release-deploy-flow.md
git mv docs/plans/active/2026-04-19-release-deploy-flow.md docs/plans/done/2026-04-19-release-deploy-flow.md
```

- [ ] **Step 2: Tick the TODO and add follow-up entries**

In `docs/TODO.md`, find the "Versioned, manually-triggered release & deploy flow" entry (currently `- [ ]`) and:

- Change `- [ ]` → `- [x]`.
- Replace its long body with a one-line back-reference: `— see docs/plans/done/2026-04-19-release-deploy-flow.md`.

Then add under "Follow-up from shipped work" (or a new section if it makes more sense):

```markdown
- [ ] Standalone single-file executables for `zwag` (cli) and `zwaggen-web` (web) — bundle Node + assets into per-OS binaries via Bun `--compile` or Node SEA, attach to GitHub Releases. Deferred from the release-flow plan because of per-OS matrix + signing complexity.
- [ ] Auto-promote on green CI — a separate, simpler workflow that fast-forwards a `staging` (or directly `production`) branch every time `main` goes green, decoupled from the explicit-version release.
- [ ] Pre-release / beta tag channels (`@next`, `@beta`) on npm.
- [ ] Publish `@zwaggen/core` as a public library when a third-party consumer materializes (currently bundled into cli, kept private).
- [ ] Publish `@zwaggen/proxy` to npm if/when there's a clear consumer story.
- [ ] Extract `apps/docs` into its own repo (`zwaggen-docs`?) so docs-only edits don't churn the main repo's git history.
```

Update the `Last updated:` line at the top to today's date.

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md docs/specs/active docs/specs/done docs/plans/active docs/plans/done
git commit -m "$(cat <<'EOF'
docs: archive release-deploy-flow spec + plan; tick TODO; add follow-ups

Standalone exec, auto-promote, beta channels, @zwaggen/core +
@zwaggen/proxy publishing, docs-extract — all moved to the follow-up
section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Final verification + handoff to user

**Files:**
- (no changes — verification only)

- [ ] **Step 1: Run the full root suite**

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
```

Expected: all green.

- [ ] **Step 2: Re-run the smoke scripts (catches any regression introduced by docs/TODO commits)**

```bash
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/web build:vite
scripts/release/smoke-cli.sh
scripts/release/smoke-web.sh
```

Expected: both end with `PASS`.

- [ ] **Step 3: Confirm the workflow file passes a syntax check via gh**

```bash
gh workflow list 2>&1 | grep -E '^release\b' || echo "Workflow not yet picked up by GH (will appear after merge to main)"
```

(This is informational — the workflow only appears in GH's list once `release.yml` is on `main`.)

- [ ] **Step 4: Report to the user — handoff checklist**

Surface the user-action items from `docs/release.md`:

> Plan complete. Before the first dispatched release, **you** must:
>
> 1. Register the `@zwaggen` scope at npmjs.com.
> 2. Create an npm automation token; add as GitHub repo secret `NPM_TOKEN`.
> 3. From a clone of `main`: `git push origin main:production`.
> 4. In CF Pages dashboard, change `play.zwaggen.com` production branch from `main` → `production`. Trigger a manual rebuild to confirm.
>
> Then dispatch the workflow from the Actions UI with `version: 0.2.0` (or whatever bump you want). Recommend a `dry_run: true` rehearsal first.

- [ ] **Step 5: No commit (verification only)**

---

## Notes for the executing engineer

- This plan assumes execution in a worktree at `.worktrees/release-deploy-flow` on branch `plan/release-deploy-flow`. Per project convention (CLAUDE.md), all git operations stay inside the worktree — never `cd` to the primary repo.
- Tasks 1–11 produce shippable commits even if Tasks 12+ are skipped (they leave the workspace in a working state). Don't let that tempt you to half-finish — the spec is satisfied only when the full workflow exists and the user can actually dispatch a release.
- Several tasks rely on `pnpm install --frozen-lockfile=false` to update the lockfile after dep changes. Always commit lockfile changes alongside the package.json change that caused them.
- For the workflow YAML, the most fragile bit is the `gh api` call in `check-ci-green.sh`. If it returns unexpected JSON shapes, debug by running the raw `gh api` command locally and inspecting the response. The `--jq` filter is the most likely thing to need adjustment.
- `pnpm publish --provenance` requires `id-token: write` permission (already set) and that the workflow runs on a GitHub-hosted runner (also set: `runs-on: ubuntu-latest`). It should "just work" the first time but if npm rejects with a provenance error, drop `--provenance` from both publish steps as a fallback and file a follow-up.
- `pnpm pack` writes the tarball into the package directory. The smoke scripts clean it up; if a test aborts mid-run you may need to `rm packages/cli/*.tgz apps/web/*.tgz` by hand.
