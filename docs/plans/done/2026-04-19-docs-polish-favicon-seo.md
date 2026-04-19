# Docs polish: favicon sharpening + SEO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship crisp multi-size favicons + a solid SEO baseline (OG/Twitter/canonical/hreflang, sitemap, robots.txt, per-page descriptions) for `apps/docs`.

**Architecture:** Extend the existing `gen-icons.mjs` script to rasterize all favicon sizes + a 1200×630 OG card from the same SVG. Wire all head metadata via VitePress's `transformPageData` + `transformHead` hooks. Enable VitePress' built-in sitemap generator. Add one-line `description:` frontmatter to each of the 26 content pages.

**Tech Stack:** VitePress 1.3, Vue 3, `sharp` (already dev-dep), `png-to-ico` (new dev-dep), VitePress built-in sitemap.

**Spec:** [docs/specs/done/2026-04-19-docs-polish-favicon-seo.md](../../specs/done/2026-04-19-docs-polish-favicon-seo.md)

**Worktree:** `.worktrees/docs-polish-favicon-seo` on branch `plan/docs-polish-favicon-seo`.

**Execution rules (project conventions):**
- All git ops run inside the worktree; never `cd` to the primary repo.
- Commit per finished step, not batched.
- Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Part 1 — Favicon sharpening

### Task 1: Install `png-to-ico`

**Files:**
- Modify: `apps/docs/package.json`

- [ ] **Step 1: Add devDependency**

```bash
pnpm --filter docs add -D png-to-ico
```

Expected: `png-to-ico` appears under `devDependencies` in `apps/docs/package.json`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify module resolves**

```bash
cd apps/docs && node -e "import('png-to-ico').then(m => console.log('ok', typeof m.default))" --input-type=module
```

Expected: `ok function` or similar.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/package.json pnpm-lock.yaml
git commit -m "chore(docs): add png-to-ico devDep for multi-size favicon.ico"
```

---

### Task 2: Thicken the favicon SVG stroke

**Files:**
- Modify: `apps/docs/public/favicon.svg`

- [ ] **Step 1: Edit the stroke width**

Open `apps/docs/public/favicon.svg`. Change the `stroke-width="7"` attribute on the `<polyline>` to `stroke-width="9"`. Leave all other attributes intact.

Full expected file contents after edit:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#4f46e5"/>
  <polyline
    points="18,22 46,22 18,42 46,42"
    fill="none"
    stroke="#ffffff"
    stroke-width="9"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add apps/docs/public/favicon.svg
git commit -m "fix(docs): thicken favicon Z stroke for small-size legibility"
```

---

### Task 3: Extend `gen-icons.mjs` to produce all favicon sizes + OG image

**Files:**
- Modify: `apps/docs/scripts/gen-icons.mjs`
- Create: `apps/docs/public/favicon-16.png`
- Create: `apps/docs/public/favicon-32.png`
- Create: `apps/docs/public/apple-touch-icon.png`
- Create: `apps/docs/public/favicon.ico`
- Create: `apps/docs/public/og-image.png`

- [ ] **Step 1: Rewrite the script**

Replace the contents of `apps/docs/scripts/gen-icons.mjs` with:

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, '../public/favicon.svg');
const outDir = resolve(here, '../public');

const svg = await readFile(svgPath);
await mkdir(outDir, { recursive: true });

// Square icons rasterized directly from the brand SVG.
const squareTargets = [
  { name: 'favicon-16.png',        size: 16 },
  { name: 'favicon-32.png',        size: 32 },
  { name: 'apple-touch-icon.png',  size: 180 },
  { name: 'pwa-192.png',           size: 192 },
  { name: 'pwa-512.png',           size: 512 },
];

for (const { name, size } of squareTargets) {
  const outPath = resolve(outDir, name);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}

// Multi-size .ico built from 16/32/48 PNGs.
const icoSizes = [16, 32, 48];
const icoBuffers = [];
for (const size of icoSizes) {
  icoBuffers.push(
    await sharp(svg, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer()
  );
}
const icoBuffer = await pngToIco(icoBuffers);
const icoPath = resolve(outDir, 'favicon.ico');
await writeFile(icoPath, icoBuffer);
console.log(`wrote ${icoPath}`);

// OG card — 1200x630 inline SVG rasterized to PNG.
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#4f46e5"/>
  <g transform="translate(120, 195) scale(3.75)">
    <rect width="64" height="64" rx="14" fill="#ffffff"/>
    <polyline points="18,22 46,22 18,42 46,42"
      fill="none" stroke="#4f46e5" stroke-width="9"
      stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="420" y="310" font-family="-apple-system, system-ui, Arial, sans-serif"
    font-weight="700" font-size="104" fill="#ffffff">Zwaggen</text>
  <text x="420" y="372" font-family="-apple-system, system-ui, Arial, sans-serif"
    font-size="36" fill="#e0e7ff">Typed API specs,</text>
  <text x="420" y="418" font-family="-apple-system, system-ui, Arial, sans-serif"
    font-size="36" fill="#e0e7ff">runtime-tested.</text>
</svg>`;
const ogPath = resolve(outDir, 'og-image.png');
await sharp(Buffer.from(ogSvg)).png().toFile(ogPath);
console.log(`wrote ${ogPath}`);
```

Note: the OG card inverts the brand colors for the mark (white tile, indigo Z) so it reads well on the indigo page background.

- [ ] **Step 2: Run the script**

```bash
node apps/docs/scripts/gen-icons.mjs
```

Expected output (order may vary):
```
wrote .../favicon-16.png
wrote .../favicon-32.png
wrote .../apple-touch-icon.png
wrote .../pwa-192.png
wrote .../pwa-512.png
wrote .../favicon.ico
wrote .../og-image.png
```

- [ ] **Step 3: Verify outputs**

```bash
file apps/docs/public/favicon-16.png \
     apps/docs/public/favicon-32.png \
     apps/docs/public/apple-touch-icon.png \
     apps/docs/public/favicon.ico \
     apps/docs/public/og-image.png \
     apps/docs/public/pwa-192.png \
     apps/docs/public/pwa-512.png
```

Expected:
- `favicon-16.png`: `PNG image data, 16 x 16, ...`
- `favicon-32.png`: `PNG image data, 32 x 32, ...`
- `apple-touch-icon.png`: `PNG image data, 180 x 180, ...`
- `favicon.ico`: `MS Windows icon resource - 3 icons, 16x16, ..., 32x32, ..., 48x48, ...`
- `og-image.png`: `PNG image data, 1200 x 630, ...`
- `pwa-192.png`, `pwa-512.png`: unchanged sizes (rebuilt with thicker stroke).

- [ ] **Step 4: Commit**

```bash
git add apps/docs/scripts/gen-icons.mjs \
        apps/docs/public/favicon-16.png \
        apps/docs/public/favicon-32.png \
        apps/docs/public/apple-touch-icon.png \
        apps/docs/public/favicon.ico \
        apps/docs/public/og-image.png \
        apps/docs/public/pwa-192.png \
        apps/docs/public/pwa-512.png
git commit -m "feat(docs): generate multi-size favicons + OG card from favicon.svg"
```

---

## Part 2 — SEO infrastructure

### Task 4: Add robots.txt

**Files:**
- Create: `apps/docs/public/robots.txt`

- [ ] **Step 1: Write the file**

Create `apps/docs/public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://docs.zwaggen.com/sitemap.xml
```

Trailing newline is fine; leave the file with a single final newline.

- [ ] **Step 2: Commit**

```bash
git add apps/docs/public/robots.txt
git commit -m "feat(docs): add robots.txt with sitemap pointer"
```

---

### Task 5: Enable built-in VitePress sitemap

**Files:**
- Modify: `apps/docs/.vitepress/config.ts`

- [ ] **Step 1: Add the `sitemap` option**

In `apps/docs/.vitepress/config.ts`, inside the `defineConfig({...})` object (place near `transformHead`, before `vite`), add:

```ts
  sitemap: {
    hostname: 'https://docs.zwaggen.com',
  },
```

- [ ] **Step 2: Build and verify sitemap.xml generated**

```bash
pnpm --filter docs build
head -40 apps/docs/.vitepress/dist/sitemap.xml
```

Expected: valid XML with `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` and at least 26 `<url><loc>https://docs.zwaggen.com/...</loc>` entries (all English routes + all `/zh-TW/` routes).

- [ ] **Step 3: Commit**

```bash
git add apps/docs/.vitepress/config.ts
git commit -m "feat(docs): enable built-in VitePress sitemap generator"
```

---

### Task 6: Expand head with full SEO metadata

**Files:**
- Modify: `apps/docs/.vitepress/config.ts`

- [ ] **Step 1: Add a per-page-description `transformPageData` hook**

In `apps/docs/.vitepress/config.ts`, inside `defineConfig({...})`, alongside `transformHead` and `sitemap`:

```ts
  transformPageData(pageData) {
    // Per-page <meta name="description"> falls back to site description.
    if (!pageData.description) {
      pageData.description =
        (pageData.frontmatter as { description?: string } | undefined)?.description ??
        'Typed API spec builder + runtime tester';
    }
  },
```

- [ ] **Step 2: Rewrite `transformHead` with full OG / Twitter / canonical / hreflang injection**

Replace the current `transformHead` block with:

```ts
  transformHead({ pageData, siteConfig }) {
    const SITE = 'https://docs.zwaggen.com';
    const DEFAULT_OG_IMAGE = `${SITE}/og-image.png`;

    // relativePath is e.g. 'introduction.md' or 'zh-TW/guide/endpoints.md'
    const rel = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const path = rel === '' ? '/' : `/${rel}`;
    const isZh = path.startsWith('/zh-TW');
    const enPath = isZh ? (path.replace(/^\/zh-TW\/?/, '/') || '/') : path;
    const zhPath = enPath === '/' ? '/zh-TW/' : `/zh-TW${enPath}`;

    const url = `${SITE}${path}`;
    const enUrl = `${SITE}${enPath}`;
    const zhUrl = `${SITE}${zhPath}`;

    const title = pageData.title ?? 'Zwaggen';
    const description = pageData.description ?? 'Typed API spec builder + runtime tester';
    const isHome = path === '/' || path === '/zh-TW/';

    return [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16.png' }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' }],
      ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
      ['link', { rel: 'shortcut icon', href: '/favicon.ico' }],
      ['meta', { name: 'theme-color', content: '#4f46e5' }],
      ['link', { rel: 'manifest', href: '/manifest.webmanifest' }],

      // OpenGraph
      ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
      ['meta', { property: 'og:site_name', content: 'Zwaggen' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:image', content: DEFAULT_OG_IMAGE }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:locale', content: isZh ? 'zh_TW' : 'en_US' }],
      ['meta', { property: 'og:locale:alternate', content: isZh ? 'en_US' : 'zh_TW' }],

      // Twitter
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: DEFAULT_OG_IMAGE }],

      // Canonical + hreflang
      ['link', { rel: 'canonical', href: url }],
      ['link', { rel: 'alternate', hreflang: 'en', href: enUrl }],
      ['link', { rel: 'alternate', hreflang: 'zh-TW', href: zhUrl }],
      ['link', { rel: 'alternate', hreflang: 'x-default', href: enUrl }],
    ];
  },
```

Note: this replaces the earlier 3-entry `transformHead` from the PWA plan. Do not keep both. The favicon + manifest links are folded into the new block.

- [ ] **Step 3: Build and inspect a rendered page**

```bash
pnpm --filter docs build
grep -oE '<meta[^>]+(og:|twitter:|description)[^>]*>' apps/docs/.vitepress/dist/introduction.html | sort -u
grep -oE '<link[^>]+(canonical|hreflang|icon|manifest)[^>]*>' apps/docs/.vitepress/dist/introduction.html | sort -u
```

Expected: all OG properties present, all three Twitter tags, canonical + two hreflang links + x-default, four icon links (svg, 16, 32, apple-touch), manifest link.

- [ ] **Step 4: Build and inspect a zh-TW page**

```bash
grep -oE '<meta[^>]+og:locale[^>]*>' apps/docs/.vitepress/dist/zh-TW/introduction.html
grep -oE '<link[^>]+(canonical|hreflang)[^>]*>' apps/docs/.vitepress/dist/zh-TW/introduction.html | sort -u
```

Expected: `og:locale` = `zh_TW`, canonical = `https://docs.zwaggen.com/zh-TW/introduction`, hreflang `en` points to the English counterpart.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/.vitepress/config.ts
git commit -m "feat(docs): full head metadata — OG, Twitter, canonical, hreflang, favicons"
```

---

## Part 3 — Per-page descriptions

Frontmatter descriptions go in front of each page's `---`-fenced block. VitePress reads them as `pageData.frontmatter.description`, which our `transformPageData` hook promotes to `pageData.description`. Each description is one English (or Traditional Chinese) sentence ≤160 characters.

### Task 7: English page descriptions (14 files)

**Files:**
- Modify: `apps/docs/index.md`
- Modify: `apps/docs/introduction.md`
- Modify: `apps/docs/installation.md`
- Modify: `apps/docs/quickstart.md`
- Modify: `apps/docs/guide/core-concepts.md`
- Modify: `apps/docs/guide/type-builder.md`
- Modify: `apps/docs/guide/endpoints.md`
- Modify: `apps/docs/guide/running-requests.md`
- Modify: `apps/docs/guide/assertions-and-chaining.md`
- Modify: `apps/docs/guide/batch-and-history.md`
- Modify: `apps/docs/guide/openapi-import.md`
- Modify: `apps/docs/guide/spec-diff.md`
- Modify: `apps/docs/guide/export-and-curl.md`
- Modify: `apps/docs/guide/cors-proxy.md`

- [ ] **Step 1: Add/extend frontmatter on `apps/docs/index.md`**

The current file starts with a `---` layout frontmatter block. Inside that block (not creating a second block), add a `description:` line. Full new frontmatter example:

```markdown
---
layout: home
description: Zwaggen — a browser-based typed API spec builder and runtime tester that pairs a Postman-style UI with Swagger/OpenAPI-compatible types.
hero:
  name: Zwaggen
  text: Typed API specs, runtime-tested.
  ...
```

Preserve every other line of the existing frontmatter as-is.

- [ ] **Step 2: Add frontmatter to `apps/docs/introduction.md`**

The file currently has no frontmatter block. Prepend:

```markdown
---
description: What Zwaggen is, who it is for, and where it fits next to Postman, Swagger, and Zod.
---

```

(Leave a blank line after the closing `---`, then the existing `# Introduction` heading follows.)

- [ ] **Step 3: Add frontmatter to `apps/docs/installation.md`**

Prepend:

```markdown
---
description: What you need installed to run Zwaggen locally and how to start the playground.
---

```

- [ ] **Step 4: Add frontmatter to `apps/docs/quickstart.md`**

Prepend:

```markdown
---
description: Send your first typed request against a live API in under two minutes — no install, no account.
---

```

- [ ] **Step 5: Add frontmatter to `apps/docs/guide/core-concepts.md`**

Prepend:

```markdown
---
description: The three building blocks of every Zwaggen spec — types, endpoints, and assertions — and how they relate.
---

```

- [ ] **Step 6: Add frontmatter to `apps/docs/guide/type-builder.md`**

Prepend:

```markdown
---
description: Compose request and response types from primitives, objects, arrays, and references without writing TypeScript.
---

```

- [ ] **Step 7: Add frontmatter to `apps/docs/guide/endpoints.md`**

Prepend:

```markdown
---
description: Define an endpoint's method, URL, params, headers, body, and response type in the spec.
---

```

- [ ] **Step 8: Add frontmatter to `apps/docs/guide/running-requests.md`**

Prepend:

```markdown
---
description: Execute a spec endpoint against the live server and see the typed response validated in real time.
---

```

- [ ] **Step 9: Add frontmatter to `apps/docs/guide/assertions-and-chaining.md`**

Prepend:

```markdown
---
description: Assert on response shape, capture values, and chain requests so one endpoint feeds the next.
---

```

- [ ] **Step 10: Add frontmatter to `apps/docs/guide/batch-and-history.md`**

Prepend:

```markdown
---
description: Run every endpoint in a spec at once, diff the results, and browse past runs from local history.
---

```

- [ ] **Step 11: Add frontmatter to `apps/docs/guide/openapi-import.md`**

Prepend:

```markdown
---
description: Seed a Zwaggen spec from an existing OpenAPI document and learn what gets preserved.
---

```

- [ ] **Step 12: Add frontmatter to `apps/docs/guide/spec-diff.md`**

Prepend:

```markdown
---
description: Compare two spec revisions and see exactly which changes are breaking and which are additive.
---

```

- [ ] **Step 13: Add frontmatter to `apps/docs/guide/export-and-curl.md`**

Prepend:

```markdown
---
description: Export a request as a cURL command, OpenAPI fragment, or typed TypeScript snippet.
---

```

- [ ] **Step 14: Add frontmatter to `apps/docs/guide/cors-proxy.md`**

Prepend:

```markdown
---
description: When the target API blocks the browser's Origin header, route requests through the Zwaggen CORS proxy.
---

```

- [ ] **Step 15: Build to confirm no YAML parse errors**

```bash
pnpm --filter docs build
```

Expected: build succeeds.

- [ ] **Step 16: Spot-check one rendered description**

```bash
grep -E 'meta name="description"' apps/docs/.vitepress/dist/guide/type-builder.html
```

Expected: the exact description string from Step 6.

- [ ] **Step 17: Commit**

```bash
git add apps/docs/index.md apps/docs/introduction.md apps/docs/installation.md apps/docs/quickstart.md apps/docs/guide/
git commit -m "feat(docs): add per-page SEO descriptions (English)"
```

---

### Task 8: zh-TW page descriptions (13 files)

**Files:**
- Modify: `apps/docs/zh-TW/index.md`
- Modify: `apps/docs/zh-TW/introduction.md`
- Modify: `apps/docs/zh-TW/installation.md`
- Modify: `apps/docs/zh-TW/quickstart.md`
- Modify: `apps/docs/zh-TW/guide/core-concepts.md`
- Modify: `apps/docs/zh-TW/guide/type-builder.md`
- Modify: `apps/docs/zh-TW/guide/endpoints.md`
- Modify: `apps/docs/zh-TW/guide/running-requests.md`
- Modify: `apps/docs/zh-TW/guide/assertions-and-chaining.md`
- Modify: `apps/docs/zh-TW/guide/batch-and-history.md`
- Modify: `apps/docs/zh-TW/guide/openapi-import.md`
- Modify: `apps/docs/zh-TW/guide/spec-diff.md`
- Modify: `apps/docs/zh-TW/guide/export-and-curl.md`
- Modify: `apps/docs/zh-TW/guide/cors-proxy.md`

- [ ] **Step 1: Add/extend `description:` on `apps/docs/zh-TW/index.md`**

Inside the existing frontmatter (or prepend one if absent) add:

```yaml
description: Zwaggen — 瀏覽器中的型別化 API 規格建構器與即時測試工具，結合 Postman 與 OpenAPI 的操作體驗。
```

- [ ] **Step 2: Prepend frontmatter to `apps/docs/zh-TW/introduction.md`**

```markdown
---
description: Zwaggen 是什麼、為誰而做，與 Postman、Swagger、Zod 的定位差異。
---

```

- [ ] **Step 3: Prepend frontmatter to `apps/docs/zh-TW/installation.md`**

```markdown
---
description: 在本機執行 Zwaggen 所需的環境與安裝步驟，以及如何啟動 Playground。
---

```

- [ ] **Step 4: Prepend frontmatter to `apps/docs/zh-TW/quickstart.md`**

```markdown
---
description: 兩分鐘內用 Zwaggen 發出第一個型別化請求 — 無需安裝、無需註冊。
---

```

- [ ] **Step 5: Prepend frontmatter to `apps/docs/zh-TW/guide/core-concepts.md`**

```markdown
---
description: 每個 Zwaggen 規格的三個核心 — 型別、端點、斷言 — 以及它們之間的關係。
---

```

- [ ] **Step 6: Prepend frontmatter to `apps/docs/zh-TW/guide/type-builder.md`**

```markdown
---
description: 以原生型別、物件、陣列與參照組合請求與回應型別,不必手動撰寫 TypeScript。
---

```

- [ ] **Step 7: Prepend frontmatter to `apps/docs/zh-TW/guide/endpoints.md`**

```markdown
---
description: 在規格中定義端點的方法、網址、參數、標頭、主體與回應型別。
---

```

- [ ] **Step 8: Prepend frontmatter to `apps/docs/zh-TW/guide/running-requests.md`**

```markdown
---
description: 對真實伺服器執行規格中的端點,即時看到型別化回應被驗證。
---

```

- [ ] **Step 9: Prepend frontmatter to `apps/docs/zh-TW/guide/assertions-and-chaining.md`**

```markdown
---
description: 針對回應結構加入斷言、擷取值,並串接多個請求讓前一個餵給下一個。
---

```

- [ ] **Step 10: Prepend frontmatter to `apps/docs/zh-TW/guide/batch-and-history.md`**

```markdown
---
description: 一次執行整份規格中的所有端點、比較差異,並從本地歷史紀錄瀏覽先前的執行結果。
---

```

- [ ] **Step 11: Prepend frontmatter to `apps/docs/zh-TW/guide/openapi-import.md`**

```markdown
---
description: 從既有的 OpenAPI 文件匯入,生成 Zwaggen 規格並了解哪些內容會被保留。
---

```

- [ ] **Step 12: Prepend frontmatter to `apps/docs/zh-TW/guide/spec-diff.md`**

```markdown
---
description: 比對兩個規格版本,清楚區分哪些變更是破壞性、哪些是新增性。
---

```

- [ ] **Step 13: Prepend frontmatter to `apps/docs/zh-TW/guide/export-and-curl.md`**

```markdown
---
description: 將請求匯出為 cURL 指令、OpenAPI 片段,或型別化的 TypeScript 程式碼。
---

```

- [ ] **Step 14: Prepend frontmatter to `apps/docs/zh-TW/guide/cors-proxy.md`**

```markdown
---
description: 當目標 API 封鎖瀏覽器的 Origin 標頭時,透過 Zwaggen 的 CORS Proxy 轉發請求。
---

```

- [ ] **Step 15: Build to confirm no YAML parse errors**

```bash
pnpm --filter docs build
```

Expected: build succeeds.

- [ ] **Step 16: Spot-check a zh-TW description**

```bash
grep -E 'meta name="description"' apps/docs/.vitepress/dist/zh-TW/guide/type-builder.html
```

Expected: the exact description string from Step 6.

- [ ] **Step 17: Commit**

```bash
git add apps/docs/zh-TW/
git commit -m "feat(docs): add per-page SEO descriptions (zh-TW)"
```

---

## Part 4 — Verify and finalize

### Task 9: End-to-end programmatic verification

**Files:** none modified.

- [ ] **Step 1: Clean build**

```bash
pnpm --filter docs build
```

Expected: build succeeds, `[PWA] precached N files` log now shows `N ≈ 184` (up from 178 with the new 6 assets).

- [ ] **Step 2: Verify all new static assets shipped**

```bash
ls -la apps/docs/.vitepress/dist/favicon-16.png \
       apps/docs/.vitepress/dist/favicon-32.png \
       apps/docs/.vitepress/dist/apple-touch-icon.png \
       apps/docs/.vitepress/dist/favicon.ico \
       apps/docs/.vitepress/dist/og-image.png \
       apps/docs/.vitepress/dist/robots.txt \
       apps/docs/.vitepress/dist/sitemap.xml
```

Expected: all 7 files exist and are non-empty.

- [ ] **Step 3: Validate sitemap.xml**

```bash
grep -c '<loc>' apps/docs/.vitepress/dist/sitemap.xml
grep -c 'zh-TW' apps/docs/.vitepress/dist/sitemap.xml
```

Expected: ≥ 26 `<loc>` entries; ≥ 13 of them contain `zh-TW`.

- [ ] **Step 4: Validate robots.txt**

```bash
cat apps/docs/.vitepress/dist/robots.txt
```

Expected: `User-agent: *` / `Allow: /` / blank / `Sitemap: https://docs.zwaggen.com/sitemap.xml`.

- [ ] **Step 5: Validate English head metadata**

```bash
grep -oE '<meta[^>]+(og:|twitter:|description)[^>]*>' apps/docs/.vitepress/dist/guide/type-builder.html | sort -u
grep -oE '<link[^>]+(canonical|hreflang|icon|manifest|apple-touch)[^>]*>' apps/docs/.vitepress/dist/guide/type-builder.html | sort -u
```

Expected: 11 OG meta tags, 4 Twitter tags, 1 description, 5 link relations (canonical, en, zh-TW, x-default, icon × 4 + manifest + apple-touch).

- [ ] **Step 6: Validate Chinese head metadata**

```bash
grep -oE '<meta[^>]+og:locale[^>]*>' apps/docs/.vitepress/dist/zh-TW/guide/type-builder.html
grep -oE '<link[^>]+canonical[^>]*>' apps/docs/.vitepress/dist/zh-TW/guide/type-builder.html
grep -oE '<link[^>]+hreflang="en"[^>]*>' apps/docs/.vitepress/dist/zh-TW/guide/type-builder.html
```

Expected:
- `og:locale` = `zh_TW`
- canonical = `https://docs.zwaggen.com/zh-TW/guide/type-builder`
- hreflang en = `https://docs.zwaggen.com/guide/type-builder`

If any of these fail, stop and diagnose before committing downstream work.

No commit for this task (verification only).

---

### Task 10: Tick `docs/TODO.md` and move spec/plan to `done/`

**Files:**
- Modify: `docs/TODO.md`
- Move: `docs/specs/active/2026-04-19-docs-polish-favicon-seo.md` → `docs/specs/done/`
- Move: `docs/plans/active/2026-04-19-docs-polish-favicon-seo.md` → `docs/plans/done/`

- [ ] **Step 1: Add a completed entry to `docs/TODO.md`**

Under the "Feature" section, after the PWA line, insert:

```markdown
- [x] Docs polish — multi-size crisp favicons + SEO baseline (OG/Twitter/canonical/hreflang, sitemap, robots); see `docs/plans/done/2026-04-19-docs-polish-favicon-seo.md`.
```

- [ ] **Step 2: Move spec and plan**

```bash
git mv docs/specs/active/2026-04-19-docs-polish-favicon-seo.md docs/specs/done/2026-04-19-docs-polish-favicon-seo.md
git mv docs/plans/active/2026-04-19-docs-polish-favicon-seo.md docs/plans/done/2026-04-19-docs-polish-favicon-seo.md
```

Open `docs/plans/done/2026-04-19-docs-polish-favicon-seo.md` and update the `**Spec:**` link from `../../specs/active/...` to `../../specs/done/...`.

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md docs/specs docs/plans
git commit -m "docs: tick docs polish; move spec+plan to done/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- Favicon thicker stroke → Task 2.
- Multi-size PNG rasters + `.ico` + OG image → Task 3.
- `<head>` favicon references → Task 6 Step 2.
- robots.txt → Task 4.
- Sitemap → Task 5.
- `transformPageData` description fallback → Task 6 Step 1.
- `transformHead` OG / Twitter / canonical / hreflang → Task 6 Step 2.
- Per-page descriptions (26 pages) → Tasks 7 + 8.

**Placeholder scan:** no TBDs; every description string is concrete; every command has an expected outcome.

**Type consistency:** `pageData.description`, `pageData.title`, `pageData.relativePath`, `siteConfig` — all are VitePress' `PageData` / `SiteConfig` public shape, consistent across Tasks 6 and later. `transformPageData` sets `pageData.description` which is then read in `transformHead`.

**Known follow-up (not in this plan):** the "verify toast on deploy" manual test happens post-merge on `docs.zwaggen.com` and is the user's own validation pass.
