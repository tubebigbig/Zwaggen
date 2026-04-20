# Drop PWA from apps/docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the PWA stack from `apps/docs` and ship a tombstone `sw.js` that auto-unregisters existing installs on next visit.

**Architecture:** Hand-written `public/sw.js` replaces the workbox-generated one; VitePWA plugin, `generateSW` buildEnd hook, manifest, PWA icons, and the update-toast component all get removed. See the spec for why the tombstone is necessary.

**Tech Stack:** VitePress 1.3, plain service worker (no workbox).

**Spec:** [docs/specs/active/2026-04-20-drop-docs-pwa.md](../../specs/active/2026-04-20-drop-docs-pwa.md)

**Worktree:** `.worktrees/drop-docs-pwa` on branch `plan/drop-docs-pwa`.

**Execution rules (from project memory):**
- All git ops run inside the worktree. Never `cd` to the primary repo for commits.
- Commit per finished step, not batched.
- Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Add the tombstone service worker

**Files:**
- Create: `apps/docs/public/sw.js`

- [ ] **Step 1: Write the tombstone**

Create `apps/docs/public/sw.js` with exactly this content:

```js
// Tombstone service worker. Replaces the previous workbox-generated sw.js.
// Purpose: when a browser with an older Zwaggen Docs PWA installed fetches
// this file as part of its normal SW update check, install it immediately,
// wipe every cache this origin owns, unregister the SW, and reload any
// open tabs so they run without a controller from then on.
//
// This is load-bearing. Removing or renaming this file will strand users
// on whatever workbox precache they last got, indefinitely.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      await caches.delete(key);
    }
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const win of windows) {
      win.navigate(win.url);
    }
  })());
});
```

- [ ] **Step 2: Verify the file lands in dist on build**

Run from the worktree root:

```bash
pnpm --filter docs build
```

Then check the built output:

```bash
ls -la apps/docs/.vitepress/dist/sw.js
head -20 apps/docs/.vitepress/dist/sw.js
```

Expected:
- File exists, < 1 KB.
- Content matches the tombstone source exactly (VitePress copies `public/` verbatim).
- **It does not contain the strings `workbox` or `precacheAndRoute`.** Run `grep -c 'workbox' apps/docs/.vitepress/dist/sw.js` — expected: `0`. If it prints a nonzero count, the old VitePWA plugin is still overwriting our file; check config.ts in Task 2 before continuing.

At this point the rest of the PWA stack is still wired, so the above `grep` will currently match — that is expected on this task. The check is for later tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/public/sw.js
git commit -m "feat(docs): add tombstone sw.js to unregister legacy PWA"
```

---

### Task 2: Strip VitePWA plugin + generateSW from VitePress config

**Files:**
- Modify: `apps/docs/.vitepress/config.ts`

- [ ] **Step 1: Delete the top-of-file imports that only the PWA uses**

Open `apps/docs/.vitepress/config.ts`. Remove these lines from the import block:

```ts
import { VitePWA } from 'vite-plugin-pwa';
import { generateSW } from 'workbox-build';
import { resolve } from 'node:path';
```

Keep `import { defineConfig } from 'vitepress';` and `import { withMermaid } from 'vitepress-plugin-mermaid';` exactly as they were.

- [ ] **Step 2: Remove the `<link rel="manifest">` entry from `transformHead`**

Inside `transformHead({ pageData })`, in the returned array, delete this single line:

```ts
      ['link', { rel: 'manifest', href: '/manifest.webmanifest' }],
```

Leave every other entry in `transformHead` untouched (favicons, OG/Twitter meta, canonical, hreflang, theme-color — all stay).

- [ ] **Step 3: Remove the entire `buildEnd` block**

Delete the full `async buildEnd(siteConfig) { ... }` property from the config object. That block is the post-build workbox `generateSW` pass; without `workbox-build` installed it will crash the build.

- [ ] **Step 4: Remove the `vite.plugins` array (whole `vite` property)**

Delete the `vite: { plugins: [ VitePWA({ ... }) ] }` property entirely. The VitePress config has no other `vite` overrides, so we can drop the whole key rather than leaving an empty `vite: { plugins: [] }` behind.

- [ ] **Step 5: Sanity-check the file**

```bash
grep -nE 'VitePWA|workbox|generateSW|manifest\.webmanifest|pwa-' apps/docs/.vitepress/config.ts
```

Expected: no matches.

```bash
pnpm --filter docs build
```

Expected: build succeeds. In the output, no line mentions `[vite-plugin-pwa]`. `apps/docs/.vitepress/dist/manifest.webmanifest` does **not** exist.

Also verify the tombstone wins:

```bash
grep -c 'workbox' apps/docs/.vitepress/dist/sw.js
head -5 apps/docs/.vitepress/dist/sw.js
```

Expected: `0`. Head output should be the tombstone's comment lines.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/.vitepress/config.ts
git commit -m "refactor(docs): remove vite-plugin-pwa + generateSW from VitePress config"
```

---

### Task 3: Drop the PwaUpdateToast from the theme

**Files:**
- Modify: `apps/docs/.vitepress/theme/index.ts`
- Delete: `apps/docs/.vitepress/theme/PwaUpdateToast.vue`

- [ ] **Step 1: Edit the theme entry**

Open `apps/docs/.vitepress/theme/index.ts`. Current state includes `PwaUpdateToast` import and `layout-bottom` slot.

Remove the `PwaUpdateToast` import line:

```ts
import PwaUpdateToast from './PwaUpdateToast.vue';
```

Remove the `'layout-bottom'` slot entry from the `Layout()` function so the slots object only contains `'home-hero-image'`:

```ts
Layout() {
  return h(DefaultTheme.Layout, null, {
    'home-hero-image': () => h(HeroInstall),
  });
},
```

If after editing the file no longer uses `h` (it does — `HeroInstall` slot still uses it), keep the `import { h } from 'vue';` import. Double-check by grepping:

```bash
grep -n '\bh(' apps/docs/.vitepress/theme/index.ts
```

Expected: at least one match. Keep the `h` import.

- [ ] **Step 2: Delete the component**

```bash
git rm apps/docs/.vitepress/theme/PwaUpdateToast.vue
```

- [ ] **Step 3: Build and confirm nothing references the dead import**

```bash
pnpm --filter docs build
grep -rln 'PwaUpdateToast\|virtual:pwa-register' apps/docs
```

Expected: build succeeds with no errors; grep returns no matches.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/.vitepress/theme/index.ts
git commit -m "refactor(docs): drop PwaUpdateToast from VitePress theme"
```

---

### Task 4: Delete PWA icon assets + `manifest.webmanifest` `_headers` rule

**Files:**
- Delete: `apps/docs/public/pwa-192.png`
- Delete: `apps/docs/public/pwa-512.png`
- Delete: `apps/docs/public/pwa-1024.png`
- Delete: `apps/docs/public/pwa-maskable-512.png`
- Modify: `apps/docs/public/_headers`

- [ ] **Step 1: Confirm no other references to these PNGs before deleting**

```bash
grep -rln 'pwa-192\|pwa-512\|pwa-1024\|pwa-maskable' apps/docs
```

Expected: only matches in `apps/docs/scripts/gen-icons.mjs` (handled in Task 5). If any other file references them (e.g. something landed in `transformHead` we missed), stop and investigate before deletion.

- [ ] **Step 2: Delete the PNGs**

```bash
git rm apps/docs/public/pwa-192.png \
       apps/docs/public/pwa-512.png \
       apps/docs/public/pwa-1024.png \
       apps/docs/public/pwa-maskable-512.png
```

- [ ] **Step 3: Remove the `/manifest.webmanifest` rule from `_headers`**

Open `apps/docs/public/_headers`. Find the block:

```
/manifest.webmanifest
  Cache-Control: public, max-age=0, must-revalidate
```

Delete those two lines and the blank line immediately before the block (or after, pick whichever keeps file tidy). Keep everything else — especially the `/sw.js` rule, which the tombstone needs.

- [ ] **Step 4: Verify**

```bash
grep -n 'manifest' apps/docs/public/_headers
```

Expected: no matches.

```bash
grep -A1 '^/sw.js' apps/docs/public/_headers
```

Expected: the `max-age=0, must-revalidate` rule is still present.

- [ ] **Step 5: Build and confirm built `_headers` matches**

```bash
pnpm --filter docs build
grep -n 'manifest' apps/docs/.vitepress/dist/_headers
grep -A1 '^/sw.js' apps/docs/.vitepress/dist/_headers
```

Expected: no manifest rule, sw.js rule intact.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/public/_headers
git commit -m "chore(docs): drop PWA manifest icons + _headers manifest rule"
```

---

### Task 5: Trim `gen-icons.mjs` so it no longer emits PWA assets

**Files:**
- Modify: `apps/docs/scripts/gen-icons.mjs`

- [ ] **Step 1: Remove PWA entries from `squareTargets`**

Open `apps/docs/scripts/gen-icons.mjs`. In the `squareTargets` array, delete the three entries `pwa-192.png` (192), `pwa-512.png` (512), and `pwa-1024.png` (1024). Keep `favicon-16.png`, `favicon-32.png`, and `apple-touch-icon.png`.

- [ ] **Step 2: Remove the maskable-icon block**

Delete the entire "Maskable icon" section — from the `const maskableSvg = ...` line down through the `console.log(\`wrote ${maskablePath}\`);` line. The comment block above it ("Maskable icon: the brand mark centered...") goes too.

- [ ] **Step 3: Leave everything else intact**

Keep: `.ico` generation block (still feeds `favicon.ico`) and `og-image.png` block (still feeds OG meta).

- [ ] **Step 4: Sanity-check by re-running the generator**

From the worktree root:

```bash
node apps/docs/scripts/gen-icons.mjs
```

Expected output lines include `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `favicon.ico`, `og-image.png`. **No** `pwa-*.png` or `pwa-maskable-512.png` lines.

Then verify the public folder hasn't resurrected any PWA PNGs:

```bash
ls apps/docs/public | grep -E '^pwa-'
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/scripts/gen-icons.mjs
git commit -m "chore(docs): stop generating PWA icon PNGs from favicon"
```

---

### Task 6: Drop PWA devDeps from package.json

**Files:**
- Modify: `apps/docs/package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Remove the three devDeps**

From the worktree root:

```bash
pnpm --filter docs remove vite-plugin-pwa workbox-build workbox-window
```

This edits `apps/docs/package.json` and regenerates `pnpm-lock.yaml`.

- [ ] **Step 2: Verify package.json**

```bash
grep -E '"vite-plugin-pwa"|"workbox-build"|"workbox-window"' apps/docs/package.json
```

Expected: no matches.

- [ ] **Step 3: Sanity-check that build still works with the deps gone**

```bash
pnpm install
pnpm --filter docs build
```

Expected: install succeeds, build succeeds with no `Cannot find module 'vite-plugin-pwa'` or workbox errors.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/package.json pnpm-lock.yaml
git commit -m "chore(docs): remove vite-plugin-pwa, workbox-build, workbox-window devDeps"
```

---

### Task 7: Final dist verification

**Files:** none modified.

- [ ] **Step 1: Clean rebuild**

```bash
rm -rf apps/docs/.vitepress/dist apps/docs/.vitepress/cache
pnpm --filter docs build
```

- [ ] **Step 2: Assert the dist is PWA-free except for the tombstone**

Run each of these. Every one must match its expected output.

```bash
ls apps/docs/.vitepress/dist/manifest.webmanifest 2>&1 || echo 'absent OK'
```
Expected: prints `absent OK` (ls errors out because the file doesn't exist).

```bash
ls apps/docs/.vitepress/dist/ | grep -E '^workbox-' || echo 'no workbox files OK'
```
Expected: `no workbox files OK`.

```bash
ls apps/docs/.vitepress/dist/ | grep -E '^pwa-' || echo 'no pwa icons OK'
```
Expected: `no pwa icons OK`.

```bash
wc -c apps/docs/.vitepress/dist/sw.js
grep -c 'workbox\|precacheAndRoute' apps/docs/.vitepress/dist/sw.js
```
Expected: file is under 1500 bytes; grep count is `0`.

```bash
ls apps/docs/.vitepress/dist/sitemap.xml
ls apps/docs/.vitepress/dist/robots.txt
```
Expected: both exist (sanity check — unchanged by this work).

- [ ] **Step 3: Spot-check a built HTML page has no manifest link**

```bash
grep -o 'rel="manifest"' apps/docs/.vitepress/dist/index.html || echo 'no manifest link OK'
grep -o '<link rel="icon"' apps/docs/.vitepress/dist/index.html
```

Expected:
- First command prints `no manifest link OK`.
- Second command prints at least one match (favicons still wired).

- [ ] **Step 4: If all checks pass, no commit.** Verification only.

If any check fails, do **not** proceed to Task 8. Fix the regression in the earliest task that introduced it and rebuild.

---

### Task 8: Manual tombstone rehearsal (reviewer-friendly, skippable if time-boxed)

This task is verification-only and produces no commits. It is a dry run of the critical failure mode: users with the old SW installed must have it cleanly removed.

**Files:** none modified.

- [ ] **Step 1: Produce a "before" build that still has the old PWA**

Check out `main` into a separate workspace (not this worktree). Build and preview:

```bash
cd /tmp/zwaggen-before
git clone --depth=1 <primary-repo-path> .  # or just cp dist from main
pnpm install
pnpm --filter docs build
pnpm --filter docs preview
```

In Chrome (not incognito), open `http://localhost:4173/`. Wait until DevTools → Application → Service Workers reports an active SW. Confirm Cache Storage has `workbox-precache-*` entries.

Kill the preview server but keep the browser tab open.

- [ ] **Step 2: Produce the "after" build from this worktree**

Back in the worktree:

```bash
pnpm --filter docs build
pnpm --filter docs preview
```

- [ ] **Step 3: Reload the browser tab**

Watch DevTools → Application → Service Workers. Expected sequence within ~5 seconds:
1. "Trying to install…" (new tombstone SW fetched).
2. "activated and is running" (tombstone took over via skipWaiting).
3. "redundant" (tombstone unregistered itself).
4. Page auto-reloads (triggered by `client.navigate`).
5. After reload: no SW registered, no caches.

- [ ] **Step 4: If the sequence did not complete**

Do not ship. The tombstone is the load-bearing safety net for this whole plan. Investigate:
- Is `/sw.js` being fetched fresh? Check Network tab, look for `Cache-Control: max-age=0`.
- Did `skipWaiting` run? Console log `self.skipWaiting()` inside install for debug.
- Did `caches.delete` complete? Console log the cache keys being deleted.

If the rehearsal must be skipped (time pressure), note it explicitly in the final summary message to the user so they can run it themselves before we push to origin.

---

### Task 9: Update docs/TODO.md, move spec and plan to done/

**Files:**
- Modify: `docs/TODO.md`
- Move: `docs/specs/active/2026-04-20-drop-docs-pwa.md` → `docs/specs/done/`
- Move: `docs/plans/active/2026-04-20-drop-docs-pwa.md` → `docs/plans/done/`

**Note:** This task runs after the feature branch has been FF-merged to `main`. The subagent executing this task should do so on the primary repo's `main` branch, **not** inside the worktree. If you (the executing subagent) receive this task and are inside the worktree, flag it to the master and stop — the master handles step 0 (merge) and only dispatches this task once `main` is at the merged tip.

- [ ] **Step 1: Add a ticked entry to `docs/TODO.md`**

Under the "Fix" section (top of the file), append a new bullet:

```markdown
- [x] Drop PWA from apps/docs — stale workbox SW was serving cached 404s after content deploys; ships a tombstone sw.js to self-unregister existing installs. See `docs/plans/done/2026-04-20-drop-docs-pwa.md`.
```

Also change the `Last updated:` date header at the top to `2026-04-20 (drop-docs-pwa)`.

Do **not** edit or unticket the existing `[x] PWA offline docs` entry under "Feature". That remains a true historical record of shipped-then-rolled-back work; the new Fix entry records the rollback.

- [ ] **Step 2: Move the spec and plan to `done/`**

```bash
git mv docs/specs/active/2026-04-20-drop-docs-pwa.md docs/specs/done/2026-04-20-drop-docs-pwa.md
git mv docs/plans/active/2026-04-20-drop-docs-pwa.md docs/plans/done/2026-04-20-drop-docs-pwa.md
```

- [ ] **Step 3: Fix the Spec link inside the moved plan**

Open `docs/plans/done/2026-04-20-drop-docs-pwa.md`. The Spec reference still points to `../../specs/active/...`. Change `specs/active` to `specs/done`.

- [ ] **Step 4: Commit on `main`**

```bash
git add docs/TODO.md docs/specs docs/plans
git commit -m "docs: ship drop-docs-pwa — move spec+plan to done, tick TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- Tombstone SW source + placement → Task 1.
- VitePWA plugin + generateSW removal → Task 2.
- Theme slot cleanup + PwaUpdateToast.vue deletion → Task 3.
- Icon assets + `_headers` manifest rule removal → Task 4.
- `gen-icons.mjs` trimmed so a future re-run can't resurrect PWA PNGs → Task 5.
- `package.json` devDep cleanup → Task 6.
- Dist verification (the tombstone is the only SW; no workbox files; no manifest; no icons) → Task 7.
- Tombstone runtime rehearsal against a pre-change build → Task 8.
- Ship bookkeeping (TODO + move to done/) → Task 9.

**Ordering rationale:**
- Task 1 creates the tombstone *before* Task 2 deletes VitePWA — this keeps the intermediate commit buildable (old SW still shipping, plus a static `public/sw.js` that's overwritten by the plugin). If a reviewer bisects through these commits, every intermediate state builds.
- Task 2 removes the plugin; after this point the tombstone actually wins in `dist/`.
- Tasks 3–6 each remove one orthogonal concern; any of them can fail review individually without blocking the others.
- Task 7 is the first moment the full "PWA is gone" assertion can be verified; it runs after everything else is removed.
- Task 8 is a manual rehearsal — the only irreversible thing is shipping a broken tombstone, which this catches.
- Task 9 is shipping bookkeeping; it depends on main being at the merged tip, so the master orchestrates the merge before dispatching this.

**Placeholder scan:** no TBDs, every shell command has an expected outcome, every file change has a specific diff description.

**Known follow-up (not in this plan):** a separate spec+plan to give `apps/web` (`play.zwaggen.com`) its own opt-in PWA. That's where offline-install makes sense — users want to install a testing tool. Out of scope here.
