# Spec — Docs sweep + playground demo positioning

## Problem

The product story drifted from what the docs site says. Since the last docs sweep we shipped:

- Codegen v1 + v1.1 (`zwag generate ts/zod`)
- Zwaggen Desktop (Electron app, slices 1–4)
- Drag-and-drop reorder/move for types & endpoints
- Type extension/inheritance
- Folders for types & endpoints
- OpenAPI `x-*` extension preservation
- Spec migration framework

`apps/docs` covers some of this (codegen guide, type-inheritance, folders), but the strategic story — **"Zwaggen Desktop is the real API client; the hosted playground is now a demo + spec generator"** — isn't told anywhere. Users land on `play.zwaggen.com`, hit a CORS wall, and bounce.

Two parallel surfaces need updating:

1. **`play.zwaggen.com` itself (the `apps/web` app)** — needs a banner explaining the demo positioning, plus a download CTA pointing at the docs site's desktop install page.
2. **`docs.zwaggen.com` (the `apps/docs` VitePress site)** — needs a Desktop guide page, a sidebar entry, and a home-page hero update mentioning desktop.

This is the parallel "Track A" while Track B (body UX overhaul) lands separately.

## Success criteria

### apps/web (play.zwaggen.com)

- A dismissible info banner at the top of the app, **above the AppHeader**, showing once on first visit and after each major version bump:
  - Text: "**Zwaggen Web is a CORS-limited demo + spec generator.** Zwaggen Desktop (CORS-free) is [coming soon](#)." — link points to the new docs Desktop page (the "coming soon" placeholder).
  - Dismiss state persists in `localStorage` keyed by a banner version (`zwaggen.banner.demo.v1`); dismissed users won't see it again until we bump the key.
  - On mobile (< 768px wide) the banner stacks gracefully; nothing reflows the AppHeader.
  - Translated for both `en` and `zh-TW`.
- A small "Desktop · Coming Soon" link in the AppHeader (right side, near GitHub/lang toggle) linking to `https://docs.zwaggen.com/guide/desktop`. Always visible.
- Both additions are tested: the banner's render + dismiss flow has a unit test; the AppHeader link has a smoke assertion that it points at the docs URL.

### apps/docs (docs.zwaggen.com)

- New page **`apps/docs/guide/desktop.md`** (en) + **`apps/docs/zh-TW/guide/desktop.md`** (zh-TW) — **POSITIONED AS "COMING SOON"** because no downloadable binaries exist yet (no release workflow, no signed builds). The page contains:
  - One-paragraph intro: what Zwaggen Desktop is and why it matters (CORS bypass, native dialogs, recents, file association).
  - **Coming-soon callout** at the top: "Zwaggen Desktop is in development. Slices 1–4 (local-test-first) shipped on 2026-04-23, but downloadable binaries are not yet available — the release workflow + code signing slices haven't landed. Watch the [GitHub repo](https://github.com/tubebigbig/Zwaggen) for releases."
  - **Why CORS bypass matters**: short paragraph contrasting browser fetch vs Node-side fetch.
  - **Native UX preview**: bullet list of what the desktop app will offer (File menu, Open Recent, `.zwag` double-click).
  - **For developers building from source**: optional section at the bottom — `git clone && pnpm install && pnpm --filter @zwaggen/desktop run release` for those who want to try the in-progress build today. NOT prominently featured.
  - **No install instructions, no Gatekeeper workaround copy, no AppImage commands.** Those land in the next docs slice when actual binaries are downloadable.
- Sidebar entry added to both locales' `Guide` section (alphabetised between "Codegen" and "Spec Diff", or wherever fits).
- **Home page (`apps/docs/index.md`) hero updated** to mention "Zwaggen Desktop coming soon — CORS-free API testing" alongside the existing web/CLI surfaces, with a CTA button or link to the new desktop page (which itself is the coming-soon placeholder).
- **Quickstart (`apps/docs/quickstart.md`)** mentions desktop as a future surface ("a native desktop app is coming soon for CORS-free API testing"). Still recommends `npx @zwaggen/web` as the primary install today.

### Sweep of existing guide pages

- **`guide/cors-proxy.md`** updated to mention "Zwaggen Desktop (coming soon) won't need a proxy at all because it bypasses browser CORS" as a forward-looking note.
- **`guide/codegen.md`** verified to cover v1.1 features (folder-key sanitization, inline types, async headers, tag camelization). If it doesn't, append a "v1.1 additions" section.
- **`guide/folders.md`** verified to mention DnD as a way to move items (already added in slice 2026-04-22; verify, don't rewrite).
- **`guide/type-inheritance.md`** verified to mention DnD reorder of `extends` chips.
- All sweep edits done in both locales.

### Out of scope

- **Building / hosting the actual Desktop binaries on a release URL.** The docs page links to the GitHub repo Releases page (which we'll populate when the release workflow lands as a separate slice). Until then, users either build from source or wait.
- **Translating new content into more locales** beyond en + zh-TW.
- **Marketing site changes** (no marketing site exists; the docs site is it).
- **Restyling the AppHeader** beyond inserting one new link/button.
- **A standalone "What's New / Changelog" page on docs** — could ship later; v1 of this slice puts the desktop page alone.
- **Re-recording any screenshots** — the existing screenshots in guides are recent enough.
- **Writing OS-detection JS to swap which `.dmg` link shows** — a single page lists both arm64 + Intel `.dmg` filenames; users pick. Auto-detect can land later.
- **Updating apps/docs's README** — that's a developer-facing file, not user-facing; skip unless there's a concrete drift.
- **Touching `play.zwaggen.com`'s actual deployment / Cloudflare config** — banner is purely an HTML/JS change in apps/web; deploys via existing main → CF Pages flow.
- **Renaming "Zwaggen Web" anywhere visible** beyond the banner copy. The product name in the title bar stays "Zwaggen".

## Approach

### apps/web banner

A new component `apps/web/src/ui/DemoBanner.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const KEY = 'zwaggen.banner.demo.v1';

export function DemoBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(localStorage.getItem(KEY) !== '1');
  }, []);
  if (!show) return null;
  return (
    <div className="bg-indigo-50 border-b border-indigo-100 px-3 py-2 text-xs text-indigo-900 flex items-center gap-2">
      <span className="flex-1">
        {t('demoBannerText')}{' '}
        <a href="https://docs.zwaggen.com/guide/desktop" className="underline font-semibold" target="_blank" rel="noreferrer">
          {t('demoBannerCta')}
        </a>
      </span>
      <button
        type="button"
        className="text-indigo-600 hover:text-indigo-900 px-1"
        aria-label={t('dismiss')}
        onClick={() => { localStorage.setItem(KEY, '1'); setShow(false); }}
      >×</button>
    </div>
  );
}
```

Mount at the top of `App.tsx`, before `<AppHeader />`. The banner's height contributes to layout naturally because the existing main content doesn't use a fixed-height header (verify by reading App.tsx).

### apps/web AppHeader desktop link

In the AppHeader's right-side nav cluster (where GitHub / lang toggle live), add:

```tsx
<a
  href="https://docs.zwaggen.com/guide/desktop"
  target="_blank"
  rel="noreferrer"
  className="btn-icon"
  title={t('downloadDesktop')}
>
  <IconMonitor className="w-4 h-4" />
</a>
```

(Use whichever icon matches the existing icon set. If no monitor/desktop icon exists, use the existing `IconLayout` or a plain "Desktop" text link.)

### i18n strings

Add to `apps/web/src/i18n/locales/en.json`:
```json
"demoBannerText": "Zwaggen Web is a CORS-limited demo + spec generator.",
"demoBannerCta": "Download Zwaggen Desktop →",
"dismiss": "Dismiss",
"downloadDesktop": "Download Zwaggen Desktop"
```

Add zh-TW counterparts:
```json
"demoBannerText": "Zwaggen Web 是受 CORS 限制的展示環境 + 規格產生器。",
"demoBannerCta": "下載 Zwaggen Desktop →",
"dismiss": "關閉",
"downloadDesktop": "下載 Zwaggen Desktop"
```

### apps/docs Desktop page (COMING-SOON shape)

`apps/docs/guide/desktop.md` (en):

```markdown
---
title: Zwaggen Desktop
description: Cross-platform Electron app for editing specs and running requests without CORS — coming soon.
---

# Zwaggen Desktop

::: tip Coming Soon
Zwaggen Desktop is in active development. Slices 1–4 (the local-test-first track) shipped on 2026-04-23, but downloadable binaries are not yet available — the release workflow + code-signing slices haven't landed. **Watch the [GitHub repository](https://github.com/tubebigbig/Zwaggen) for releases.**
:::

A native desktop app for editing specs and running requests against any API, with **no CORS limitations**. The hosted [Zwaggen Web](https://play.zwaggen.com) is great for browsing the spec builder UX and generating specs, but every cross-origin request hits browser CORS — which most APIs reject without explicit allow-list rules. Zwaggen Desktop runs requests through the OS network stack instead, the same way curl or Postman does.

## What's coming

- **CORS-free request runner** — every HTTP request goes through the Electron main process, bypassing browser CORS entirely.
- **Native file dialogs** — Open / Save with your OS's real picker.
- **`.zwag` file association** — double-click a spec in Finder/Explorer to open it.
- **Recents menu** — File → Open Recent, persisted to disk, integrated with the OS recent-docs surface.
- **Strict security baseline** — context-isolated renderer, sandboxed, no Node access from the UI, no outbound network from the renderer.
- **Cross-platform** — macOS (Intel + Apple Silicon), Windows, Linux.

## Try the in-progress build (developers)

If you want to try Zwaggen Desktop today, you can build it from source. **This is for developers experimenting with the feature**, not for general use:

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop run release
```

Output lands in `apps/desktop/release/`. The .dmg/.exe/.AppImage there is unsigned, so launching it triggers Gatekeeper / SmartScreen warnings — installation guidance will land here when official signed builds are available.

## Until it ships

Use [Zwaggen Web](https://play.zwaggen.com) for spec editing and demo requests, plus the [`@zwaggen/cli`](/installation) for headless / CI runs. Both work today.
```

Mirror in `apps/docs/zh-TW/guide/desktop.md` with the same structure and the callout/CTAs translated. Code blocks aren't translated.

### Sidebar config

Edit `apps/docs/.vitepress/config.ts` to add `{ text: 'Desktop', link: '/guide/desktop' }` to the en `Guide` sidebar items, and `{ text: '桌面應用', link: '/zh-TW/guide/desktop' }` to the zh-TW one. Place between Codegen and Spec Diff (or wherever feels natural).

### Home page hero

Read `apps/docs/index.md` and `apps/docs/zh-TW/index.md` for the current hero/CTA shape. If there's a `HeroInstall` component (per the npm-deploy slice), add a parallel `HeroDesktop` card OR extend `HeroInstall` to mention both. Decision deferred to implementation time based on what's there.

### Sweep targets

For each of the four sweep targets (cors-proxy, codegen, folders, type-inheritance) in BOTH locales:
- Open the file.
- Search for keywords that would naturally appear in updated content.
- If the content drifted, append a small section or rewrite the relevant paragraph.
- Don't restructure — minimal targeted edits.

### Tests

- **Unit test for `DemoBanner`**: render, click dismiss, assert localStorage flag set, re-render → banner gone.
- **AppHeader smoke test** already exists; extend to assert the desktop link is present (use `getByTitle` or `getByText`).
- **Docs build smoke**: `pnpm --filter docs build` must complete cleanly with the new page + sidebar entry. (VitePress fails the build on broken links — the new page must exist before the sidebar references it.)
- **No new dead-link warnings.** VitePress reports them; treat as failures.

### Risks

- **Banner height shifts existing screenshots.** The screenshots in guide pages are taken with no banner; on a fresh install (banner showing) the UI is shorter by ~30px. Acceptable — banner dismisses on first interaction.
- **Localization gap**: if zh-TW translations are imperfect, ship them and iterate. The user is the source of truth for zh-TW polish.
- **Desktop page links to GitHub Releases that don't exist yet.** Footnoted in the warning callout. Acceptable for now.
- **Sidebar reordering** can break other deep links if anchors change. Adding a new entry doesn't reorder anchors; adding without removing/renaming is safe.

## Done definition

- `DemoBanner.tsx` shipped with i18n strings + unit test.
- AppHeader gains a desktop link.
- New `apps/docs/guide/desktop.md` + zh-TW counterpart, sidebar entry in both locales.
- Home + quickstart updated to mention desktop.
- Sweep edits to cors-proxy / codegen / folders / type-inheritance (both locales).
- `pnpm --filter docs build` clean.
- `pnpm --filter web test` + `pnpm --filter web lint` clean.
- TODO entry added (and ticked) for this slice.
- Spec + plan moved to `done/`.
- Branch `plan/docs-and-demo-positioning` pushed.
