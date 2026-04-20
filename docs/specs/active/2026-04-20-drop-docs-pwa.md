# Spec — Drop PWA from apps/docs

**Status:** active
**Date:** 2026-04-20
**Scope:** `apps/docs` only. Adding an (unrelated) PWA to `apps/web` (`play.zwaggen.com`) is an explicit follow-up, not this spec.

## Goal

Remove the entire PWA stack from `apps/docs` so `docs.zwaggen.com` serves as a plain static site again, and ship a one-deploy **tombstone service worker** that auto-unregisters any previously installed SW on visitor browsers.

After this ships, a freshly built `dist/` contains no Workbox output, no `manifest.webmanifest`, and no PWA icon assets — only a tiny hand-written `sw.js` that deactivates itself on first fetch and clears all Cache Storage entries.

## Motivation

1. **Stale SW is actively harming real users.** The shipped PWA (plan `2026-04-19-pwa-offline-docs.md`) uses `registerType: 'prompt'` with `skipWaiting: false` and `clientsClaim: false`. Users who visited before recent deploys (sitemap, npm-install guide, folder pages) are still being served from their local precache and never see the update prompt unless they close every docs tab. This matches the reported symptom: `https://docs.zwaggen.com/sitemap.xml` rendering VitePress's `404.html` in a normal browser while `curl` returns the file with HTTP 200 and matching etag.
2. **Docs don't benefit from offline reading in practice.** The corpus is small, Cloudflare Pages is fast, and the existing `Cache-Control: public, max-age=300, must-revalidate` on HTML is already short enough to keep browsers current on normal deploys — without any of the SW staleness risk.
3. **No cheap way to force-fix stuck installs.** Purging the CF edge cache does nothing for users whose browsers short-circuit the request at the SW layer. We cannot remotely unregister user SWs, so the only fix is for the site itself to ship a SW that tells existing installs to tear themselves down.

## Non-goals

- Adding a PWA to `apps/web` (`play.zwaggen.com`). The playground is a much better offline-install candidate (users install a testing tool they re-open); that's a separate future spec.
- Deleting the SVG favicon, `apple-touch-icon.png`, or OG image — those are unrelated to the PWA manifest and stay.
- Any redesign of `_headers`, CSP, or the VitePress head beyond the manifest link and unused icon links.
- Changing how docs are deployed. Cloudflare Pages continues to serve the `dist/` as-is.

## Architecture — the tombstone SW

The risk in removing a PWA is that every browser with the old SW installed will keep running it indefinitely, because:
- browsers periodically fetch `/sw.js` to check for updates;
- if we simply *delete* `sw.js`, the old registration persists in the client and keeps serving cached HTML from its precache;
- we cannot reach into client storage from outside.

The fix is to replace `sw.js` with a minimal script that, when the browser fetches it as an "update" candidate, installs itself, deletes all caches, unregisters itself, and asks open tabs to reload. Because the browser bypasses the SW fetch-handler when revalidating the SW file itself, this update check reliably reaches the CDN even when the old SW would otherwise serve stale content.

Pseudocode of the replacement `sw.js`:

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url);
  })());
});
```

Key properties:
- Calling `skipWaiting()` inside `install` means the tombstone activates even though the old SW had `skipWaiting: false`. The old SW's config only controls the old SW's install/activate; it has no say over what the replacement does.
- `caches.keys()` returns every cache origin-scoped to `docs.zwaggen.com`, not just the workbox-generated ones — so any `workbox-precache-*`, `workbox-runtime-*`, and manifest caches are all wiped.
- `registration.unregister()` detaches the SW from the origin; after the active tabs reload, the origin has no controller and subsequent navigations hit the network directly.
- `client.navigate(client.url)` reloads any tabs that were open when the tombstone activated, so users don't have to touch anything to see fresh content.

The tombstone lives at `apps/docs/public/sw.js` (VitePress copies `public/` verbatim to `dist/`, so the file ends up at `dist/sw.js` — exactly where the previous build placed the workbox SW).

We retain the existing `_headers` rule `/sw.js: Cache-Control: public, max-age=0, must-revalidate` so the CDN never caches the tombstone and every returning visitor revalidates against origin. After the tombstone has run once per browser, the SW is gone and the header no longer matters for that client.

Future deploys: we could delete `public/sw.js` at any point more than a few days after this ships, because any browser still visiting would have long since run the tombstone. For safety we'll leave it in place indefinitely — it's 500 bytes and costs nothing.

## Non-tombstone removals

On top of the SW replacement, strip every PWA moving part from source:

- **Plugin wiring** in `apps/docs/.vitepress/config.ts`: delete the `VitePWA` import, the `vite.plugins` array that configured it, the `buildEnd` hook that ran `workbox-build.generateSW` (and its helper imports), and the `<link rel="manifest">` entry inside `transformHead`. Keep everything else in `transformHead` (OG tags, favicons, theme-color, hreflang).
- **Theme slot** in `apps/docs/.vitepress/theme/index.ts`: drop the `PwaUpdateToast` import and the `layout-bottom` slot entry. Keep the `home-hero-image` slot for `HeroInstall`.
- **Component file** `apps/docs/.vitepress/theme/PwaUpdateToast.vue`: delete outright.
- **Icon assets** in `apps/docs/public/`: delete `pwa-192.png`, `pwa-512.png`, `pwa-1024.png`, and `pwa-maskable-512.png` — they were only referenced by the manifest. Keep `favicon.*`, `apple-touch-icon.png`, and `og-image.png`.
- **Icon generator** `apps/docs/scripts/gen-icons.mjs`: drop the `pwa-*.png` entries from the `squareTargets` array and remove the maskable-icon block. Keep favicon + apple-touch-icon + OG generation.
- **Dev deps** in `apps/docs/package.json`: remove `vite-plugin-pwa`, `workbox-build`, and `workbox-window`.
- **CDN header rule** in `apps/docs/public/_headers`: remove the `/manifest.webmanifest` rule (the file won't exist anymore). Keep the `/sw.js` rule — the tombstone lives there.

## File changes summary

New:
- `apps/docs/public/sw.js` — ~500-byte tombstone service worker (see Architecture above).

Deleted:
- `apps/docs/.vitepress/theme/PwaUpdateToast.vue`
- `apps/docs/public/pwa-192.png`
- `apps/docs/public/pwa-512.png`
- `apps/docs/public/pwa-1024.png`
- `apps/docs/public/pwa-maskable-512.png`

Modified:
- `apps/docs/.vitepress/config.ts` — remove PWA plugin, `generateSW` buildEnd, manifest link.
- `apps/docs/.vitepress/theme/index.ts` — remove `PwaUpdateToast` slot.
- `apps/docs/public/_headers` — remove `/manifest.webmanifest` rule.
- `apps/docs/scripts/gen-icons.mjs` — drop PWA icon outputs.
- `apps/docs/package.json` — drop `vite-plugin-pwa`, `workbox-build`, `workbox-window`.
- `pnpm-lock.yaml` — regenerated by pnpm.

## Testing

### Build verification

- `pnpm --filter docs build` succeeds, no warnings about missing `vite-plugin-pwa` / workbox.
- `apps/docs/.vitepress/dist/sw.js` exists and contains the tombstone source **only** (≤ 1 KB, no `workbox` string anywhere).
- `apps/docs/.vitepress/dist/manifest.webmanifest` does **not** exist.
- `apps/docs/.vitepress/dist/workbox-*.js` does **not** exist.
- `grep -rl 'virtual:pwa-register\|workbox' apps/docs/.vitepress/dist` returns no matches.
- `apps/docs/.vitepress/dist/sitemap.xml` exists (sanity check — unrelated feature, same build).

### Runtime verification — clean install (no prior SW)

- `pnpm --filter docs preview`, open `http://localhost:4173/` in an incognito window.
- DevTools → Application → Service Workers: none registered. Good.
- Reload the page, navigate around: everything works, no SW involvement.

### Runtime verification — tombstone activation (with prior PWA SW installed)

This is the critical test. Procedure:

1. `git checkout main` (or the last commit before this plan lands), `pnpm --filter docs build && pnpm --filter docs preview`. Open the site, wait for DevTools → Application → Service Workers to report "activated and is running"; wait for Cache Storage to show `workbox-precache-*` populated. Close the terminal's `preview` but keep the tab open.
2. Switch back to the branch with this plan applied. Rebuild: `pnpm --filter docs build && pnpm --filter docs preview`.
3. Reload the tab. Expected sequence in DevTools:
   - A new SW is fetched from `/sw.js` (network tab shows 200, `Cache-Control: max-age=0`).
   - New SW "installing" → "waiting" → "activated" (fast, because tombstone calls `skipWaiting`).
   - The activate handler runs: Cache Storage entries disappear, the SW unregisters, the tab auto-navigates to reload.
   - After the auto-reload: no controller, no SW, no caches. Fresh content from the network.
4. Verify by manually requesting a URL that wasn't in the old precache (e.g. a brand-new page). Pre-tombstone that would 404 from the precache fallback; post-tombstone it should load fine.

If step 3 fails to clear the SW, the tombstone is wrong — do not ship.

## Risks

- **Tombstone runs twice on edge cases.** If a user has multiple tabs open, each tab may observe the tombstone activation and auto-reload. The worst case is two quick reloads — annoying but not broken.
- **Leftover `workbox-*.js.map` in user caches.** Not a functional problem; once the tombstone deletes all caches the entries are gone.
- **Browsers that never re-check sw.js.** In theory a browser could cache `sw.js` past its TTL; in practice all evergreen browsers honor the `max-age=0, must-revalidate` header on SW files and Chrome additionally uses `Update on reload`. This has been the case for every deploy since the PWA shipped — no evidence of problems.
- **Removing `workbox-build` risks breaking the `buildEnd` hook.** Scope of change is small; the hook is deleted along with the import. Build verification catches regressions.

## Deployment

Standard flow: FF-merge to `main`, push to origin, Cloudflare Pages auto-deploys the docs site. No CF dashboard changes required. `docs.zwaggen.com` and `zwaggen.com` (both bound to the same Pages project) pick up the new build simultaneously.
