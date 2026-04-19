# Spec — docs polish: favicon sharpening + SEO

**Status:** active
**Date:** 2026-04-19
**Scope:** `apps/docs` only. `apps/web` (playground) is out of scope.

## Goals

1. **Sharpen the favicon** across browsers and OSes so the tab-bar icon is crisp at 16×16 and the iOS home-screen icon looks polished.
2. **Give the docs a solid SEO baseline**: per-page meta descriptions, OpenGraph/Twitter cards, canonical URLs, hreflang alternates, a sitemap, and a robots.txt.

## Motivation

The docs currently ship only `favicon.svg`. Browsers downscale it to 16×16, and the thin white Z polyline (1.75px at that size) looks fuzzy. Fix: thicken the stroke *and* ship PNG rasters so no downscaling happens.

For SEO: the site currently has no OpenGraph tags, no canonical URLs, no sitemap, and no per-page descriptions. When someone pastes `docs.zwaggen.com` into Slack or Twitter, they get the URL with no preview card. Search engines fall back to the first lines of visible body text. Both hurt first-impression credibility for a product docs site.

## Non-goals

- JSON-LD structured data (`TechArticle`, `SoftwareApplication`) — deferred until an SEO signal justifies the maintenance.
- Breadcrumbs, `<link rel="prev/next">` — low-value for this site's depth.
- Per-page OG images — single shared image suffices for a docs site with ~26 pages.
- Last-modified dates in the sitemap — VitePress' built-in sitemap plugin populates them automatically from git metadata (or build time); no custom work needed.
- `apps/web` SEO — separate concern.

## Part 1 — Favicon

### Changes

1. **Thicken SVG stroke**: `apps/docs/public/favicon.svg` — `stroke-width` 7 → 9 in the Z polyline. Improves visibility when rasterized at 16×16 and 32×32.

2. **Generate PNG rasters + ICO from the SVG** via the existing `apps/docs/scripts/gen-icons.mjs`, extended to emit:
   - `favicon-16.png` — 16×16
   - `favicon-32.png` — 32×32
   - `apple-touch-icon.png` — 180×180 (iOS home screen default)
   - `favicon.ico` — multi-size (16, 32, 48) legacy `.ico` bundle
   - `og-image.png` — 1200×630 social card (see Part 2)
   - Existing: `pwa-192.png`, `pwa-512.png` (unchanged)

   New devDep: `png-to-ico` to assemble the `.ico`.

3. **Update `<head>` references** via VitePress `transformHead`:
   ```html
   <link rel="icon" type="image/svg+xml" href="/favicon.svg">
   <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
   <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
   <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
   <link rel="shortcut icon" href="/favicon.ico">
   ```

   Browser selects the most appropriate asset. The SVG takes precedence for modern browsers that support it at any size; the PNGs catch legacy clients and iOS.

4. **PWA manifest unchanged.** The existing `pwa-192.png` / `pwa-512.png` entries still cover installable-app icon duty.

### Testing

- `ls apps/docs/.vitepress/dist/` shows all new assets.
- Open a preview in a browser; tab icon is crisp.
- `curl -sSI http://localhost:4173/favicon-16.png` returns 200, `image/png`.
- `file apps/docs/public/favicon.ico` reports "MS Windows icon resource - 3 icons".

## Part 2 — SEO baseline

### Per-page metadata (`transformPageData`)

A VitePress `transformPageData` hook runs for each page at build time:

- Read `pageData.frontmatter.description`. If absent, fall back to the site-wide description (`'Typed API spec builder + runtime tester'`). Assign it to `pageData.description` so VitePress emits `<meta name="description">` automatically.

### Per-page OG / Twitter / canonical / hreflang (`transformHead`)

For each rendered page, emit:

```html
<!-- OG -->
<meta property="og:type" content="article">   <!-- "website" for the home -->
<meta property="og:site_name" content="Zwaggen">
<meta property="og:title" content="{page title}">
<meta property="og:description" content="{page description}">
<meta property="og:url" content="https://docs.zwaggen.com{path}">
<meta property="og:image" content="https://docs.zwaggen.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{en_US or zh_TW}">
<meta property="og:locale:alternate" content="{the other one}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{page title}">
<meta name="twitter:description" content="{page description}">
<meta name="twitter:image" content="https://docs.zwaggen.com/og-image.png">

<!-- Canonical -->
<link rel="canonical" href="https://docs.zwaggen.com{path}">

<!-- hreflang alternates -->
<link rel="alternate" hreflang="en"        href="https://docs.zwaggen.com{en-path}">
<link rel="alternate" hreflang="zh-TW"     href="https://docs.zwaggen.com/zh-TW{en-path}">
<link rel="alternate" hreflang="x-default" href="https://docs.zwaggen.com{en-path}">
```

Path-pair computation:
- Strip any leading `/zh-TW` from the current path → `enPath`.
- Prefix `/zh-TW` onto `enPath` → `zhPath`.
- Home pages: `/` ↔ `/zh-TW/`.

These tags are built from `pageData` passed to `transformHead`.

### Sitemap

VitePress 1.3 has a built-in sitemap generator. Enable in `config.ts`:

```ts
sitemap: { hostname: 'https://docs.zwaggen.com' }
```

Generates `/sitemap.xml` listing all 26 content pages + the 404. URLs are absolute. No custom per-page logic needed.

### robots.txt

Create `apps/docs/public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://docs.zwaggen.com/sitemap.xml
```

### Per-page descriptions (content work)

Add `description:` frontmatter to each of the 26 markdown pages, written by hand to be 1 sentence summarizing that page's topic (≤160 chars for search-snippet fit):

- `apps/docs/index.md` + `apps/docs/zh-TW/index.md`
- `apps/docs/introduction.md` + zh-TW equivalent
- `apps/docs/installation.md` + zh-TW equivalent
- `apps/docs/quickstart.md` + zh-TW equivalent
- `apps/docs/guide/*.md` (10 pages) + `apps/docs/zh-TW/guide/*.md` (10 pages)

Example English descriptions:
- Introduction: `"What Zwaggen is, who it's for, and where it fits next to Postman, Swagger, and Zod."`
- Quickstart: `"Run a typed request against a live API in under two minutes — no install, no account."`
- Type Builder: `"Compose request/response types from primitives, objects, arrays, and references."`

Chinese descriptions are the translated equivalents.

### OG image

`og-image.png` — 1200×630 PNG generated from the favicon SVG by `gen-icons.mjs`:

- Solid indigo background (`#4f46e5`)
- The white Z mark, centered vertically, on the left third
- "Zwaggen" in white sans-serif, 72px, to the right of the mark
- "Typed API spec builder + runtime tester" in white, 32px, below

Rendering approach: compose a 1200×630 SVG template inline in `gen-icons.mjs` (indigo background rect + Z polyline + two text elements), then rasterize it with `sharp` → PNG. Text renders via SVG `<text>` with a web-safe font stack (`system-ui, -apple-system, Arial`). One static image shared across all pages.

## File changes

### Modified

- `apps/docs/public/favicon.svg` — stroke 7 → 9
- `apps/docs/scripts/gen-icons.mjs` — extended output list
- `apps/docs/.vitepress/config.ts` — `sitemap`, `transformPageData`, expanded `transformHead`
- `apps/docs/package.json` — add `png-to-ico` devDep
- All 26 markdown content pages — add `description:` frontmatter

### New

- `apps/docs/public/favicon-16.png`
- `apps/docs/public/favicon-32.png`
- `apps/docs/public/apple-touch-icon.png`
- `apps/docs/public/favicon.ico`
- `apps/docs/public/og-image.png`
- `apps/docs/public/robots.txt`

## Testing

### Build verification

- `pnpm --filter docs build` succeeds.
- `dist/sitemap.xml` exists, validates as XML, includes all English + zh-TW routes, all URLs absolute to `https://docs.zwaggen.com`.
- `dist/robots.txt` exists with the expected contents.
- `dist/favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `favicon.ico`, `og-image.png` all exist.

### Rendered `<head>` checks

On `dist/introduction.html`:
- `<meta name="description">` present, content = the frontmatter description.
- All OG tags present with absolute URLs/images.
- `<meta property="og:locale" content="en_US">`.
- All three Twitter tags present.
- `<link rel="canonical" href="https://docs.zwaggen.com/introduction.html">` (or `/introduction` depending on cleanUrls behaviour — verify what VitePress emits).
- Two `<link rel="alternate" hreflang>` entries plus `x-default`.

On `dist/zh-TW/introduction.html`:
- OG locale flipped to `zh_TW`.
- Canonical + hreflang alternates point to the right paired URL.

### Visual

- Preview in Chrome: tab bar favicon at 100% zoom is visibly crisp.
- Paste `http://localhost:4173` into the Facebook Sharing Debugger or https://www.opengraph.xyz/ — preview card renders (image, title, description).

### Precache follow-up

The new static assets are all picked up automatically by `workbox-build`'s glob in the post-SSG step. Precache entry count rises by ~6. No SW config change.

## Risks

- **Sitemap URL base**: ensure `sitemap.hostname` uses no trailing slash. VitePress handles the join.
- **Canonical vs `cleanUrls`**: VitePress emits pretty URLs (`/introduction` without `.html`). Canonical should match the public-facing URL (no `.html`). Verify what `pageData.relativePath` looks like at `transformHead` time and strip `.md` / transform consistently.
- **Markdown frontmatter typos** breaking VitePress: 26 manual edits. Low risk, but re-run `pnpm --filter docs build` after edits to catch any yaml syntax errors early.
- **OG image rendering fidelity**: sharp's text compositing is serviceable but not exquisite. Acceptable for v1; revisit if the preview looks off.
