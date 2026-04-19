# PWA offline docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/docs` (`docs.zwaggen.com`) installable as a PWA with full offline reading, including both locales, screenshots, local search, and Mermaid diagrams.

**Architecture:** Wire `vite-plugin-pwa` (Workbox-backed) into the VitePress build. Scaffold a custom VitePress theme to register the service worker and render a locale-aware update-toast. App icons rasterized once from `favicon.svg` via a local `sharp` script and committed as static assets.

**Tech Stack:** VitePress 1.3, Vue 3 (VitePress default theme), `vite-plugin-pwa`, Workbox, `workbox-window`, `sharp` (dev-only, one-shot icon generation).

**Spec:** [docs/specs/active/2026-04-19-pwa-offline-docs.md](../../specs/active/2026-04-19-pwa-offline-docs.md)

**Worktree:** `.worktrees/pwa-offline-docs` on branch `plan/pwa-offline-docs`.

**Execution rules (from project memory):**
- All git ops run inside the worktree. Never `cd` to the primary repo for commits.
- Commit per finished step, not batched.
- Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/docs/package.json`

- [ ] **Step 1: Add devDependencies**

Run from worktree root:

```bash
pnpm --filter docs add -D vite-plugin-pwa workbox-window sharp
```

Expected: three new entries in `apps/docs/package.json` under `devDependencies`. `pnpm-lock.yaml` updated at monorepo root.

- [ ] **Step 2: Verify install**

```bash
pnpm --filter docs exec vite-plugin-pwa --help 2>/dev/null; \
  node -e "console.log(require('vite-plugin-pwa/package.json').version)" --input-type=commonjs \
  --require /dev/null 2>/dev/null || \
  node -e "import('vite-plugin-pwa').then(m => console.log('ok', Object.keys(m).slice(0,3)))"
```

Expected: `ok [ ... ]` or a version string. Any output confirming the module resolves is fine.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/package.json pnpm-lock.yaml
git commit -m "chore(docs): add vite-plugin-pwa, workbox-window, sharp devDeps"
```

---

### Task 2: Generate PWA PNG icons from favicon.svg

**Files:**
- Create: `apps/docs/scripts/gen-icons.mjs`
- Create: `apps/docs/public/pwa-192.png`
- Create: `apps/docs/public/pwa-512.png`

- [ ] **Step 1: Write the icon generator script**

Create `apps/docs/scripts/gen-icons.mjs`:

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, '../public/favicon.svg');
const outDir = resolve(here, '../public');

const sizes = [192, 512];

const svg = await readFile(svgPath);

await mkdir(outDir, { recursive: true });
for (const size of sizes) {
  const outPath = resolve(outDir, `pwa-${size}.png`);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}
```

- [ ] **Step 2: Run the script**

```bash
node apps/docs/scripts/gen-icons.mjs
```

Expected output:
```
wrote .../apps/docs/public/pwa-192.png
wrote .../apps/docs/public/pwa-512.png
```

- [ ] **Step 3: Verify PNG files exist and are non-empty**

```bash
ls -la apps/docs/public/pwa-192.png apps/docs/public/pwa-512.png
file apps/docs/public/pwa-192.png apps/docs/public/pwa-512.png
```

Expected: both files present, each > 1 KB, `file` reports PNG image with correct dimensions.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/scripts/gen-icons.mjs apps/docs/public/pwa-192.png apps/docs/public/pwa-512.png
git commit -m "feat(docs): generate PWA app icons from favicon.svg"
```

---

### Task 3: Scaffold custom VitePress theme

**Files:**
- Create: `apps/docs/.vitepress/theme/index.ts`

- [ ] **Step 1: Write the theme entry**

Create `apps/docs/.vitepress/theme/index.ts`:

```ts
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './style.css';

export default {
  extends: DefaultTheme,
} satisfies Theme;
```

- [ ] **Step 2: Create empty theme stylesheet**

Create `apps/docs/.vitepress/theme/style.css`:

```css
/* Custom theme styles. Reserved for PWA update-toast. */
```

- [ ] **Step 3: Verify VitePress still builds**

```bash
pnpm --filter docs build
```

Expected: build succeeds. VitePress auto-detects the custom theme at `.vitepress/theme/index.ts`. No functional change yet.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/.vitepress/theme/index.ts apps/docs/.vitepress/theme/style.css
git commit -m "feat(docs): scaffold custom VitePress theme"
```

---

### Task 4: Wire vite-plugin-pwa into VitePress config

**Files:**
- Modify: `apps/docs/.vitepress/config.ts`

- [ ] **Step 1: Import the plugin and add `vite` config**

Edit `apps/docs/.vitepress/config.ts`. Add import at top:

```ts
import { VitePWA } from 'vite-plugin-pwa';
```

Add a `vite` block inside the `defineConfig({ ... })` object (place it alongside `markdown`, before the closing brace):

```ts
  vite: {
    plugins: [
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json,ico}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          name: 'Zwaggen Docs',
          short_name: 'Zwaggen',
          description: 'Typed API spec builder + runtime tester — documentation',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#4f46e5',
          background_color: '#ffffff',
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
  },
```

- [ ] **Step 2: Inject `<link rel="icon">` and `<meta name="theme-color">` into `<head>`**

In the same file, add a `transformHead` option inside `defineConfig`:

```ts
  transformHead: ({ assets }) => {
    return [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      ['meta', { name: 'theme-color', content: '#4f46e5' }],
    ];
  },
```

(The manifest `<link>` is injected automatically by `vite-plugin-pwa`.)

- [ ] **Step 3: Build and inspect output**

```bash
pnpm --filter docs build
ls apps/docs/.vitepress/dist/sw.js apps/docs/.vitepress/dist/manifest.webmanifest
```

Expected: both files exist. Print the manifest:

```bash
cat apps/docs/.vitepress/dist/manifest.webmanifest
```

Expected: JSON matching the `manifest` config above, with icon paths resolving to `/favicon.svg`, `/pwa-192.png`, `/pwa-512.png`.

- [ ] **Step 4: Verify precache manifest coverage**

```bash
grep -oE '"url":"[^"]+"' apps/docs/.vitepress/dist/sw.js | head -30
```

Expected: entries for HTML files (both locales), JS/CSS bundles, `screenshots/*.png`, `favicon.svg`, `pwa-192.png`, `pwa-512.png`.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/.vitepress/config.ts
git commit -m "feat(docs): wire vite-plugin-pwa with manifest + precache config"
```

---

### Task 5: Build the update-toast Vue component

**Files:**
- Create: `apps/docs/.vitepress/theme/PwaUpdateToast.vue`

- [ ] **Step 1: Write the component**

Create `apps/docs/.vitepress/theme/PwaUpdateToast.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useData } from 'vitepress';

const needRefresh = ref(false);
const updateSW = ref<(reload?: boolean) => Promise<void>>(async () => {});

const { lang } = useData();

const t = computed(() => {
  const isZh = lang.value.startsWith('zh');
  return {
    message: isZh ? '有新版文件可用。' : 'New docs available.',
    refresh: isZh ? '重新整理' : 'Refresh',
    dismiss: isZh ? '關閉' : 'Dismiss',
  };
});

onMounted(async () => {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const { registerSW } = await import('virtual:pwa-register');
  updateSW.value = registerSW({
    onNeedRefresh() {
      needRefresh.value = true;
    },
    onOfflineReady() {
      // no-op: offline readiness is silent by design
    },
  });
});

async function applyUpdate() {
  await updateSW.value(true);
}

function dismiss() {
  needRefresh.value = false;
}
</script>

<template>
  <Transition name="pwa-toast">
    <div v-if="needRefresh" class="pwa-toast" role="status" aria-live="polite">
      <span class="pwa-toast__msg">{{ t.message }}</span>
      <button class="pwa-toast__btn pwa-toast__btn--primary" @click="applyUpdate">
        {{ t.refresh }}
      </button>
      <button class="pwa-toast__btn" :aria-label="t.dismiss" @click="dismiss">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-toast {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  font-size: 0.875rem;
  max-width: 90vw;
}
.pwa-toast__msg { flex: 1 1 auto; }
.pwa-toast__btn {
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  color: inherit;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font: inherit;
  cursor: pointer;
}
.pwa-toast__btn:hover { border-color: var(--vp-c-brand-1); }
.pwa-toast__btn--primary {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  border-color: var(--vp-c-brand-1);
}
.pwa-toast__btn--primary:hover { background: var(--vp-c-brand-2); }
.pwa-toast-enter-active, .pwa-toast-leave-active { transition: all 0.25s ease; }
.pwa-toast-enter-from, .pwa-toast-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
```

- [ ] **Step 2: Typecheck (syntax-only; no tsc in docs)**

```bash
pnpm --filter docs build
```

Expected: build succeeds. The component isn't used yet; we're only confirming VitePress accepts the file.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/.vitepress/theme/PwaUpdateToast.vue
git commit -m "feat(docs): add PWA update-toast component"
```

---

### Task 6: Mount the update-toast in the theme layout

**Files:**
- Modify: `apps/docs/.vitepress/theme/index.ts`

- [ ] **Step 1: Enhance the app with a layout slot**

Replace the contents of `apps/docs/.vitepress/theme/index.ts` with:

```ts
import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import PwaUpdateToast from './PwaUpdateToast.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(PwaUpdateToast),
    });
  },
} satisfies Theme;
```

(`layout-bottom` is a VitePress default-theme slot rendered after the main layout; it's the right place for a floating toast.)

- [ ] **Step 2: Build and preview**

```bash
pnpm --filter docs build
pnpm --filter docs preview
```

Expected: preview starts on `http://localhost:4173` (or similar). Open it, open DevTools → Application → Service Workers. Verify the SW is registered and activated. No update toast on a fresh install (there's nothing to update from).

- [ ] **Step 3: Commit**

```bash
git add apps/docs/.vitepress/theme/index.ts
git commit -m "feat(docs): mount PWA update-toast in layout-bottom slot"
```

---

### Task 7: Ensure `sw.js` is not long-cached by the CDN

**Files:**
- Modify: `apps/docs/public/_headers`

- [ ] **Step 1: Read current `_headers`**

```bash
cat apps/docs/public/_headers
```

- [ ] **Step 2: Add a no-cache rule for `sw.js` and the manifest**

Append to `apps/docs/public/_headers` (keep existing rules intact):

```
/sw.js
  Cache-Control: public, max-age=0, must-revalidate

/manifest.webmanifest
  Cache-Control: public, max-age=0, must-revalidate
```

Rationale: Cloudflare Pages must revalidate the SW on every request so new deploys are picked up immediately. Precached asset URLs are already content-hashed, so they can keep long cache lifetimes.

- [ ] **Step 3: Build and confirm `_headers` is copied to `dist/`**

```bash
pnpm --filter docs build
grep -A1 "^/sw.js" apps/docs/.vitepress/dist/_headers
```

Expected: the new rule present in the built `_headers`.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/public/_headers
git commit -m "fix(docs): no-cache sw.js + manifest at the CDN edge"
```

---

### Task 8: Local verification — offline reading

**Files:** none modified.

- [ ] **Step 1: Build and start preview**

```bash
pnpm --filter docs build
pnpm --filter docs preview
```

Note the URL (e.g. `http://localhost:4173`).

- [ ] **Step 2: Register and precache in Chrome**

Open the preview URL in Chrome. Open DevTools → Application tab.
- **Service Workers:** status is "activated and is running".
- **Manifest:** "Zwaggen Docs" parsed, no errors, icons resolve.
- **Cache Storage:** there's a `workbox-precache-*` entry with ~40+ requests.

- [ ] **Step 3: Simulate offline**

DevTools → Network → throttling dropdown → **Offline**. Hard-reload the page.

Expected: page renders identically. Screenshots load. Navigate the sidebar to three un-visited pages (e.g. `/guide/openapi-import`, `/zh-TW/introduction`, `/guide/spec-diff`). All render offline.

- [ ] **Step 4: Lighthouse PWA audit**

DevTools → Lighthouse → select "Progressive Web App" category → Analyze.

Expected: passing marks on "Installable" and "PWA Optimized" sections. Record the score (screenshot optional).

- [ ] **Step 5: If any check fails, diagnose before proceeding**

Common fixes:
- Missing icon dimensions → re-run Task 2.
- SW 404 on reload → check `vite` block in `config.ts`, rebuild.
- Offline navigation falls through → confirm `navigateFallback: '/index.html'` is present.

If no failures, no commit for this task (verification only).

---

### Task 9: Local verification — update toast flow

**Files:** none modified.

- [ ] **Step 1: Start from a clean build and load in browser**

```bash
pnpm --filter docs build
pnpm --filter docs preview
```

Open preview URL, let SW register.

- [ ] **Step 2: Simulate a new deploy**

Edit any visible text in `apps/docs/introduction.md` (e.g. append ` (v2)` to the title) and save. In a second terminal:

```bash
pnpm --filter docs build
```

Leave the old preview running — VitePress preview serves from `dist/`, which has now been replaced. In the browser tab, wait up to 60s or reload. (The SW's update check runs on page load and every ~24h.)

- [ ] **Step 3: Observe the toast**

Expected: bottom-right toast appears reading "New docs available." with a Refresh button.
- Click **Refresh** → page reloads → updated title visible.
- On a fresh load, no toast (you're current).
- Switch to `/zh-TW/` and repeat: toast text is "有新版文件可用。".

- [ ] **Step 4: Revert the test edit**

```bash
git checkout apps/docs/introduction.md
```

- [ ] **Step 5: If the toast did not appear**

Check browser console for errors from `virtual:pwa-register`. Confirm `registerType: 'prompt'` is set in `config.ts`. Confirm the `workbox-window` devDep is installed. Rebuild and retry.

No commit for this task.

---

### Task 10: Update `docs/TODO.md` and move spec/plan to `done/`

**Files:**
- Modify: `docs/TODO.md`
- Move: `docs/specs/active/2026-04-19-pwa-offline-docs.md` → `docs/specs/done/`
- Move: `docs/plans/active/2026-04-19-pwa-offline-docs.md` → `docs/plans/done/`

- [ ] **Step 1: Add a completed TODO entry under "Feature"**

Edit `docs/TODO.md`. Add this line to the "Feature" section (just after the Tutorial docs entries, keeping the list chronological):

```markdown
- [x] PWA offline docs — installable app + full precache for `apps/docs`; see `docs/plans/done/2026-04-19-pwa-offline-docs.md`.
```

- [ ] **Step 2: Bump the "Last updated" line**

Change `Last updated: 2026-04-19` if the date has changed during execution; keep it `2026-04-19` otherwise.

- [ ] **Step 3: Move the spec and plan to `done/`**

```bash
git mv docs/specs/active/2026-04-19-pwa-offline-docs.md docs/specs/done/2026-04-19-pwa-offline-docs.md
git mv docs/plans/active/2026-04-19-pwa-offline-docs.md docs/plans/done/2026-04-19-pwa-offline-docs.md
```

Update the relative link inside the moved plan header (if it points back to the spec) — open `docs/plans/done/2026-04-19-pwa-offline-docs.md`, change the `Spec:` link from `../../specs/active/...` to `../../specs/done/...`.

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md docs/specs docs/plans
git commit -m "docs: tick PWA offline docs; move spec+plan to done/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- Installable manifest + icons → Tasks 2, 4.
- Precache of HTML / JS / CSS / screenshots / search index → Task 4.
- Both locales precached → Task 4 (`globPatterns` picks up `zh-TW/**`).
- Update-toast with locale awareness → Tasks 5, 6.
- No-cache on `sw.js` at the edge → Task 7.
- Favicon already committed (out-of-band before the worktree).
- Verification: build, offline reload, Lighthouse, update flow → Tasks 8, 9.
- Ship hygiene (TODO.md + move to `done/`) → Task 10.

**Placeholder scan:** no TBDs, all code blocks complete, every command has an expected outcome.

**Type consistency:** `updateSW` refers to the same ref in `script setup` and `applyUpdate`. `registerSW` is imported from `virtual:pwa-register` (module provided by `vite-plugin-pwa`). `DefaultTheme.Layout` is the correct member of the VitePress default theme. Slot name `layout-bottom` matches VitePress's documented slot.

**Known follow-up (not in this plan):** if future docs additions push the precache over 5 MB, switch large assets (notably screenshots) to a `CacheFirst` runtime strategy — deferred until it actually happens.
