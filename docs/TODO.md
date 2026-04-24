# Zwaggen — TODO

Simple checklist of work not yet done. Future sessions: read this and pick one.

Last updated: 2026-04-24 (web-bundled-proxy)

## Fix

- [x] Lang toggle button clipped when showing `中文` — swap `btn-icon` (fixed `w-7`) for inline utility classes that auto-fit width. See `docs/plans/done/2026-04-19-lang-toggle-button.md`.
- [x] Responsive layout (RWD) — see `docs/plans/done/2026-04-20-responsive-layout.md`.
- [x] React `act(...)` warnings in TypePanel / RunPanel tests — see `docs/plans/done/2026-04-21-act-warnings.md`.
- [x] `pnpm --filter web build` passes `tsc -b` again — swept ~60 strict-mode errors (noUncheckedIndexedAccess, vi.fn generic drift, stale fixtures). See `docs/plans/done/2026-04-18-fix-web-build.md`.
- [ ] Manual UX pass on all shipped plans (real browser)
- [x] Drop PWA from apps/docs — stale workbox SW was serving cached 404s after content deploys; ships a tombstone sw.js to self-unregister existing installs. See `docs/plans/done/2026-04-20-drop-docs-pwa.md`.
- [x] **play.zwaggen.com stale-HTML-after-deploy bug** — switched `apps/web/public/_headers` HTML rule from `max-age=300, must-revalidate` to `no-cache, must-revalidate`. Browser now revalidates every HTML hit (304 if unchanged) so post-deploy users never see stale HTML pointing at purged assets. Hashed assets keep their year-long immutable cache. See `docs/plans/done/2026-04-23-cache-and-object-query.md`.

## Feature

- [x] CI-mode CLI for batch + diff — see docs/plans/done/2026-04-19-ci-cli.md
- [ ] Saved request presets
- [ ] Per-environment `servers[]`
- [ ] Header capture + JSONPath filter expressions
- [ ] Postman collection import
- [x] Folders (nested) for Types and Endpoints — see `docs/plans/done/2026-04-20-folders-types-endpoints.md`.
- [x] Type extension / inheritance — multi-parent `ObjectType.extends?: string[]`; resolver flattens the chain for validator/example/diff; OpenAPI + JSON Schema round-trip via allOf; markdown refs became clickable anchors as part of this scope. See `docs/plans/done/2026-04-20-type-extension.md`.
- [x] Drag-and-drop between folders in TypePanel and EndpointList — see `docs/plans/done/2026-04-22-dnd-folders-and-extends.md`.
- [x] Drag-reorder parents in the TypeBuilder Extends chip picker — see `docs/plans/done/2026-04-22-dnd-folders-and-extends.md`.
- [ ] Effective-shape preview panel in TypeBuilder (deferred polish from type-extension v1 — inherited + override rows already convey effective shape).
- [x] **Codegen (TypeScript types + Zod schemas + typed client)** — `zwag generate ts <spec>` outputting universal TS source (browser + Node + Deno + Bun). See `docs/plans/done/2026-04-22-codegen.md`.
- [x] **Codegen v1.1 — folder keys, inline types, async headers, ergonomics** — `auth/User` sanitizes to `auth_User`, inline `requestBody` / param objects expand to real TS shapes (no more `unknown`), `opts.headers` accepts `() => Promise<Record<string,string>>` for token refresh, and tag-grouped client uses camelCase property names. See `docs/plans/done/2026-04-23-codegen-v1.1.md`.
- [x] Codegen v1.2 — symmetric inline-object expansion in `zodTypeExpr` for response parsers. Mirrors the v1.1 `tsRefType` fix; empty objects emit `z.object({})`. See `docs/plans/done/2026-04-23-dnd-polish-and-codegen-v1.2.md`.
- [x] Object-typed query/header params expand into per-field rows — `expandParam` helper in `@zwaggen/core` used by RunPanel, codegen, and OpenAPI exporter. Form/explode semantics (OpenAPI 3 default). See `docs/plans/done/2026-04-23-cache-and-object-query.md`.
- [x] Query and header params as ObjectType (schema v7) — collapses the dual-tier model; `endpoint.queryParams: ObjectType | RefType | undefined` (same for headers); `expandParam` deleted; new `resolveParamFields` helper. EndpointEditor toggles inline / ref / none. See `docs/plans/done/2026-04-23-params-as-object.md`.
- [x] **Body UX overhaul** — schema v5 with `bodyContentType` + `bodyForm`; runner produces URLSearchParams / FormData / JSON; EndpointEditor + RunPanel get key/value rows for non-JSON bodies; codegen handles urlencoded (multipart throws a clear placeholder); OpenAPI round-trip for all three content types; desktop IPC carries multipart via `[name,value][]`. See `docs/plans/done/2026-04-23-body-ux-overhaul.md`.
- [x] **Body UX v1.1 — file uploads.** Schema v6 with `'file'` TypeDef kind + placement validator; runner appends File/Blob to FormData; desktop IPC bytes-over-IPC with 50MB/file + 100MB/total caps; bootstrap adapter walks `arrayBuffer()` per file; TypeBuilder/ParamTable surface File only in multipart bodyForm; RunPanel renders `<input type="file">`; codegen emits real FormData (replacing the v1 throw placeholder); OpenAPI round-trips files via `type: 'string', format: 'binary'`. See `docs/plans/done/2026-04-23-body-ux-files.md`.
- [ ] **Body UX v1.2 — streamed/large file uploads + multi-file fields.** Lifts the 50MB IPC cap via temp-file paths or chunked streaming; supports `<input multiple>` (arrays of files). Surfaced from Body UX v1.1.
- [ ] **Zwaggen Desktop (Electron)** — cross-platform spec editor + API client; HTTP bypasses browser CORS via Node main process. Slices 1–4 (local-test-first track) shipped 2026-04-23 — desktop is feature-complete for local development. Remaining: code signing + notarization, GitHub Releases workflow, auto-update. See `docs/specs/active/2026-04-22-zwaggen-desktop.md` (strategic) and `docs/plans/done/` for the slice-by-slice history.
- [x] Zwaggen Desktop slice 2 — `electron-builder` packaging (.dmg / .exe / .AppImage); no signing yet. Brand icons generated from favicon.svg. See `docs/plans/done/2026-04-23-desktop-packaging.md`.
- [x] Zwaggen Desktop slice 3 — `.zwag` file association + Recents UI; single-instance lock; on-disk recents at <userData>/recents.json. See `docs/plans/done/2026-04-23-desktop-recents-and-fileassoc.md`.
- [x] Zwaggen Desktop slice 4 — hardening polish: cloud-metadata blocklist + 30s timeout on IPC HTTP, serialized recents writes + existsSync guard, open-file buffer-as-array, StrictMode-safe bridge subscriptions, `pnpm desktop:dev` one-command script, CI step for desktop tests, try/finally iconset cleanup, Cloudflare metadata excluded from package. See `docs/plans/done/2026-04-23-desktop-hardening.md`.
- [ ] Zwaggen Desktop — code signing (mac notarization + Windows EV) — deferred until ready to ship publicly.
- [x] _(prep for Desktop)_ Transport abstraction in `@zwaggen/core` — `sendRequest(req, { transport })` accepts a custom transport; default `fetchTransport` preserves existing behaviour. See `docs/plans/done/2026-04-22-core-transport-abstraction.md`.
- [x] _(prep for Desktop)_ Storage abstraction in `apps/web` — `SpecStorage` interface covers drafts + file I/O + recents; browser default delegates to existing `idb-keyval` + File System Access API; recents persisted at `zwaggen:recents` (capped at 10, no UI yet). See `docs/plans/done/2026-04-22-web-storage-abstraction.md`.
- [x] _(prep for Desktop)_ Open-by-path entry point in `apps/web` — `?spec=<url>` (browser deep-link) and `?specPath=<path>` (desktop launch) URL params drive a boot-time load; `SpecStorage.openByPath` slot for the desktop impl. See `docs/plans/done/2026-04-22-web-open-by-path.md`.
- [ ] _(prep for Desktop, async)_ Apple Developer enrollment ($99/yr) for macOS code signing + notarization. Pure paperwork, no engineering — start in parallel with any other work.
- [x] Versioned, manually-triggered release & deploy flow — see docs/plans/done/2026-04-19-release-deploy-flow.md
- [x] Tutorial docs site (VitePress) — `apps/docs/` — all 13 English pages + full zh-TW translation shipped; see `docs/plans/done/2026-04-18-tutorial-docs-site.md`
- [x] Tutorial docs: screenshot sweep — 13 UI shots captured via Playwright (`pnpm --filter web e2e:screenshots`); wired into every Guide page in both locales
- [x] Tutorial docs: deploy — live at `docs.zwaggen.com` (tutorial) and `play.zwaggen.com` (playground) via Cloudflare Pages; auto-deploys on push to `main`
- [x] PWA offline docs — installable app + full precache for `apps/docs`; see `docs/plans/done/2026-04-19-pwa-offline-docs.md`.
- [x] Docs polish — multi-size crisp favicons + SEO baseline (OG/Twitter/canonical/hreflang, sitemap, robots); see `docs/plans/done/2026-04-19-docs-polish-favicon-seo.md`.
- [x] npm-only install docs + controlled docs deploy — `deploy-docs.yml` workflow FF-pushes main → docs; Cloudflare Pages now watches the `docs` branch; docs install page + quickstart (en + zh-TW) rewritten for `npx @zwaggen/web`; HeroInstall card on home page. See `docs/plans/done/2026-04-20-docs-npm-deploy.md`.
- [x] Docs sweep + playground demo positioning — apps/web demo banner + AppHeader desktop link; new "coming soon" `apps/docs/guide/desktop.md` page (en + zh-TW); home / quickstart / cors-proxy mention desktop; sidebar entry; codegen page refreshed with v1.1 additions section. See `docs/plans/done/2026-04-23-docs-and-demo-positioning.md`.
- [x] Bundled CORS proxy in `npx @zwaggen/web` — single Node process serves the SPA AND mounts the proxy at `/proxy` (same-origin = no CORS preflight). Runner's default proxy URL auto-configures via a `__ZWAGGEN_BUNDLED_PROXY__` hint injected into the served index.html. Standalone `npx @zwaggen/proxy` and hosted `play.zwaggen.com` unaffected. See `docs/plans/done/2026-04-24-web-bundled-proxy.md`.

## Follow-up from shipped work

- [x] Canonical stringify for `schema/diff.ts` type equality — see docs/plans/done/2026-04-19-canonical-stringify-diff.md
- [x] Deduplicate apps/web + @zwaggen/core — migrated apps/web to import from @zwaggen/core and deleted the duplicates (48 import sites across 87 files). See `docs/plans/done/2026-04-20-dedupe-web-core.md`.
- [x] Spec version migration framework — replaced the inline v1→v2 branch in `fromJSON` with a registry + chain walker; tightened schemaVersion validation; documented the "Adding a new version" pattern. See `docs/plans/done/2026-04-20-spec-migration-framework.md`.
- [x] User-facing load-error modal on the web app — see `docs/plans/done/2026-04-21-load-error-modal.md`.
- [ ] zwag run — wire authentication (secrets via env vars or config file)
- [ ] zwag run — input injection (per-endpoint inputs from a JSON file, replace "1" placeholder)
- [ ] zwag run — request body support
- [ ] zwag run — parallel execution with concurrency flag
- [ ] zwag — --json output format
- [ ] "Run all = fresh network calls" toggle in batch runner
- [x] Preserve `x-*` extensions in OpenAPI importer — see `docs/plans/done/2026-04-22-preserve-openapi-extensions.md`.
- [x] TypePanel rapid-Add-type race: uncontrolled `defaultValue` on "Type name" input lets a stale-closure rename clobber a subsequent addType. Flip to controlled `value`/`onChange` or `key={selected}` remount. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-typepanel-add-type-race.md
- [x] AppHeader `backdrop-blur` creates a containing block that traps `fixed inset-0` dialogs (DiffPanel, BatchRunPanel) to the header's frame. Move `backdrop-filter` off the outer header or portal the dialogs. (Found while building docs screenshot capture.) — see docs/plans/done/2026-04-19-appheader-backdrop-blur.md
- [ ] Standalone single-file executables for `zwag` (cli) and `zwaggen-web` (web) — bundle Node + assets into per-OS binaries via Bun `--compile` or Node SEA, attach to GitHub Releases. Deferred from the release-flow plan because of per-OS matrix + signing complexity.
- [ ] Auto-promote on green CI — a separate, simpler workflow that fast-forwards a `staging` (or directly `production`) branch every time `main` goes green, decoupled from the explicit-version release.
- [ ] Pre-release / beta tag channels (`@next`, `@beta`) on npm.
- [ ] Publish `@zwaggen/core` as a public library when a third-party consumer materializes (currently bundled into cli, kept private).
- [ ] Publish `@zwaggen/proxy` to npm if/when there's a clear consumer story.
- [ ] Extract `apps/docs` into its own repo (`zwaggen-docs`?) so docs-only edits don't churn the main repo's git history.
- [x] Extend `AppHeader.openSpec` try/catch to cover the I/O phase — see `docs/plans/done/2026-04-21-open-spec-io-errors.md`.
- [x] `LoadErrorModal` should move focus into the dialog on open — see `docs/plans/done/2026-04-22-load-error-modal-focus.md`.
- [x] `apps/web/src/storage/file.ts` `uploadFile()` swallows errors thrown inside its `input.onchange` async handler — see `docs/plans/done/2026-04-22-uploadfile-onchange-error.md`.
- [ ] Extend OpenAPI `x-*` round-trip to info-level, schema-level, and parameter/response-level (deferred from preserve-openapi-extensions v1 — endpoint-level only).
- [x] Stale zh-TW docs reference schemaVersion 1 — swept both locales' `core-concepts.md` to v4; also updated `openapi-import.md` to reflect operation-level `x-*` preservation.
- [x] `@dnd-kit` screen-reader announcements (grab/move/drop/cancel) localized via a shared `useDndAnnouncements()` hook wired into TypePanel, EndpointList, and ExtendsPicker. zh-TW users now hear localized DnD events. See `docs/plans/done/2026-04-23-dnd-polish-and-codegen-v1.2.md`.
- [x] `TYPE_PANEL_ROOT_ID` / `ENDPOINT_LIST_ROOT_ID` switched to `'$$ROOT$$'` (a value `isValidSegment` rejects), so a user folder literally named `__root__` can no longer collide with the DnD root drop zone. See `docs/plans/done/2026-04-23-dnd-polish-and-codegen-v1.2.md`.
- [x] `setTypeFolder` / `setEndpointFolder` now return `{ ok, reason }`; TypePanel + EndpointList show an aria-live amber banner for 4s on collision. New i18n key `dndCollisionMessage` (en + zh-TW). See `docs/plans/done/2026-04-23-dnd-polish-and-codegen-v1.2.md`.
- [x] Keyboard-DnD e2e: `apps/web/e2e/keyboard-dnd.spec.ts` exercises Space-grab on TypePanel and asserts the localized announcement reaches @dnd-kit's `role="status"` live region. See `docs/plans/done/2026-04-23-dnd-polish-and-codegen-v1.2.md`.
- [ ] Per-param style override for object-typed query — `style: 'deepObject'` (Stripe / JSON:API: `?filter[status]=active`) and `style: 'json'` (single-key JSON: `?filter={"status":"active"}`) for users who don't want form/explode. v1 hard-codes form/explode. Surfaced from the object-query expansion slice (`docs/plans/done/2026-04-23-cache-and-object-query.md`).
- [ ] Body form params as ObjectType (v8?) — extend the v7 collapse to `endpoint.bodyForm`. FileType placement validator becomes "valid only inside the multipart body's object" — manageable but distinct enough to defer. Surfaced from `docs/plans/done/2026-04-23-params-as-object.md`.
- [ ] Auto-enable "Use proxy" on first cross-origin failure — when the runner gets a TypeError on a cross-origin request and a proxy URL is configured (bundled or otherwise), surface a one-click "Retry through proxy" suggestion. Avoids the user having to know about the toggle in the first place. Surfaced from `docs/plans/done/2026-04-24-web-bundled-proxy.md`.
