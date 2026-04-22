# Spec — Zwaggen Desktop (Electron)

## Problem

`play.zwaggen.com` is a static page. Browsers enforce CORS on every cross-origin request the React UI makes, so users who paste their own API URL and click "Run" usually see a CORS failure instead of a real response. Today the only way around this is `npx @zwaggen/web` plus a separately-launched `zwaggen-proxy` — a workflow that's fine for advanced users but kills the funnel for everyone else.

The right answer for non-trivial usage is a **desktop app whose HTTP requests go through a native shell, not the browser**, so CORS isn't an issue at all (the way Postman, Insomnia, and Bruno work). The hosted page stays as a CORS-limited demo entry point.

This is also the foundation for Zwaggen growing into a "strong-typed Postman" — gRPC, GraphQL subscriptions, WebSocket, request signing, scripting sandboxes — features that need a real runtime, not a browser sandbox.

## Success criteria

- A desktop binary called **Zwaggen** is downloadable for macOS, Windows, and Linux from the docs site / GitHub Releases.
- On launch the user sees the same React UI that ships at `play.zwaggen.com`, but every request hits its target directly — **no CORS errors regardless of the API's `Access-Control-Allow-Origin` headers**.
- No separate proxy process. No localhost ports. No setup.
- macOS build is **signed and notarized** (downloaded `.dmg` opens cleanly without "damaged" warnings).
- Windows build ships **unsigned for v0** (SmartScreen warning is acceptable while we're pre-funded; documented in the install page).
- Linux build ships as **AppImage** (single file, no install script).
- The hosted playground at `play.zwaggen.com` is **renamed "Zwaggen Web"** in branding/docs, with a clear banner explaining it's a CORS-limited demo and a download CTA for the desktop app.
- The desktop app feels like a real native app, not a webpage in a window:
  - Native menu bar (File / Edit / View / Help) with platform-correct shortcuts.
  - Recent files list (last N specs opened).
  - "Open with…" from Finder / Explorer / file manager works for `.zwag` files.
  - Standard keyboard shortcuts work (Cmd/Ctrl+O / S / R / ,).
- Spec files persist to disk as real files (not just localStorage), with a defined file extension (`.zwag` — see Approach).
- All existing apps/web tests still pass. The Electron main process has its own thin test surface (IPC handlers + transport).

## Out of scope (v0)

- **gRPC, GraphQL subscriptions, WebSocket** — long-term roadmap, additive after v0 ships. These belong in `packages/core` as new transports; the Electron shell will surface them when they exist.
- **Auto-updater** — v0 ships without `electron-updater`. Users redownload from the docs site. Add in v1 once we know the release cadence.
- **Tabs / multi-window / multi-spec open at once** — single-spec-at-a-time matches the current web UX. Add tabs as v1 if users ask.
- **Windows EV code signing** — defer until there's budget / scale that justifies the $200-400/yr.
- **Linux package formats beyond AppImage** — no `.deb` / `.rpm` / Flatpak / Snap in v0.
- **Touch Bar / Jump List / system tray** — platform-flavor polish for later.
- **Embedded scripting sandbox** (Postman-style pre-request scripts) — distinct feature, separate spec.
- **Sync / cloud workspaces** — Zwaggen stays local-first.
- **Telemetry** — v0 ships with zero phone-home. Crash reporting can come later, opt-in.

## Approach

### Architecture

Standard Electron split:

```
apps/desktop/                          ← new package
├── electron/main.ts                   ← Node main process; owns HTTP, file I/O, menus
├── electron/preload.ts                ← exposes a typed bridge on window.zwaggen
├── electron/ipc.ts                    ← IPC handler implementations
├── electron/menu.ts                   ← native menu definitions per OS
├── electron-builder.yml               ← packaging config (mac/win/linux targets)
├── package.json                       ← electron, electron-builder, @zwaggen/core, @zwaggen/proxy
└── (renderer = built apps/web bundle, loaded via loadFile)
```

`apps/web` stays the single React codebase. Build it with Vite as today; the desktop app loads the built `index.html` from disk. In dev, the Electron main connects to `http://localhost:5173` so HMR works.

### How CORS gets bypassed

The renderer's `fetch()` is still browser fetch — CORS-bound. The trick is that the renderer **does not call fetch directly** when running in the desktop shell. Instead:

1. `@zwaggen/core/runner/send.ts` is refactored so `sendRequest()` accepts an injectable **Transport** (P1 prep work). Default transport calls global `fetch`. The transport is a single interface like `(req: BuiltRequest) => Promise<RawResponse>`.
2. In the browser playground, the default fetch transport is used → CORS applies as today.
3. In the desktop shell, `apps/web` detects `window.zwaggen` is present and constructs a **Node-IPC transport** that forwards `BuiltRequest` over Electron IPC to the main process.
4. The main process imports `@zwaggen/core`, runs the request through Node's global `fetch` (which has no CORS — CORS is a browser-only security model), and returns the raw response back over IPC.

This keeps the renderer pure, keeps `@zwaggen/core` runtime-agnostic, and means we don't have to monkey with Electron's `webRequest` / strip CORS headers (which works but is hacky).

### Storage

Today `apps/web` uses IndexedDB / localStorage / browser File picker. Desktop wants real filesystem. The plan (P2 prep work):

- Add a **Storage** interface in `apps/web/src/storage/` that abstracts: load spec by path, save spec to path, list recent files, persist preferences.
- Browser implementation = current behaviour (localStorage + File API).
- Desktop implementation = IPC to main, which reads/writes via `node:fs` and persists prefs via `electron-store`.

This is a small refactor and useful even without desktop (e.g., makes the storage layer mockable in tests).

### Spec file extension

Today specs are `.json`. Desktop wants OS file association so double-clicking a spec opens it in Zwaggen.

Decision: **`.zwag`** (a JSON file with a custom extension — same content, different suffix). Backward compatible: the importer accepts `.json` too. New "Save As" defaults to `.zwag`. Documented in the docs site.

### Distribution

Use `electron-builder` for cross-platform packaging:

| OS | Format | Signing |
|----|--------|---------|
| macOS | `.dmg` (Intel + ARM) | Apple Developer ID + notarization (P14 prep) |
| Windows | `.exe` NSIS installer | Unsigned v0 — SmartScreen warning documented |
| Linux | AppImage | None needed |

Releases attach to GitHub Releases via the existing `release-deploy-flow` workflow (extended), and the docs site's "Install" page gets desktop-download buttons (per-OS auto-detection).

### Branding

- Desktop app: **Zwaggen** (icon, name, dock badge).
- Hosted playground: **Zwaggen Web** (header text + docs site + CTA wording).
- Reuse the existing brand mark; generate platform-specific icon assets (`.icns`, `.ico`, multi-size PNG) from the source SVG (P17 prep).

### Relationship to existing surfaces

| Surface | Role after Zwaggen Desktop ships |
|---------|----------------------------------|
| `play.zwaggen.com` (Zwaggen Web) | Demo. CORS-limited. Funnel to desktop download. |
| `docs.zwaggen.com` | Tutorial + install + API docs. Adds desktop section. |
| `npx @zwaggen/web` | Stays. For users who prefer running locally without a desktop binary. Keep as a power-user path. |
| `npx @zwaggen/cli` (`zwag`) | Stays. Headless CI use. Independent of desktop. |
| `@zwaggen/proxy` | Stays as-is for the `npx @zwaggen/web` flow. Desktop app does NOT depend on it. |

### Testing

- Existing `apps/web` unit + e2e tests run unchanged (renderer is the same React app).
- New thin test layer in `apps/desktop/electron/`: unit tests for the IPC handlers (handle a fake `BuiltRequest`, return a fake `RawResponse`); test that the menu definitions match expected accelerators per OS.
- One e2e smoke test using Playwright's Electron support (`_electron.launch`) that boots the packaged app, opens a spec, runs a request against `httpbin.org` (real cross-origin), asserts no CORS error.

## Prerequisites (the prep phase)

These ship before the desktop work begins, in roughly this order. Each gets its own focused spec + plan when picked up.

### Code prep (in `@zwaggen/core` and `apps/web`)
1. **Transport abstraction in `@zwaggen/core`** — refactor `sendRequest` to take an injectable transport. Default is current fetch behaviour. (P1)
2. **Storage abstraction in `apps/web`** — interface + browser implementation; desktop implementation lands with the desktop app itself. (P2)
3. **Open-by-path entry point** — `apps/web` accepts a spec path / blob via constructor / URL param so the desktop shell can pass "open this file" intent on launch. (P3)

### UX backlog that elevates the v0 to "basic experience"
4. Saved request presets (already in TODO). (P4)
5. Per-environment `servers[]` (already in TODO). (P5)
6. Manual UX pass on all shipped plans (already in TODO). (P9)

### Desktop-native UX scaffolding (lands inside the desktop work itself, but listed for completeness)
7. Native menu bar (File / Edit / View / Help) with platform accelerators. (P10)
8. Keyboard shortcut audit across the renderer to make sure Cmd/Ctrl+O/S/R/, behave consistently. (P11)
9. Recent files list with persistence. (P12)
10. `.zwag` file extension decision + importer support + docs. (P13)

### Organizational / no-code
11. Apple Developer enrollment ($99/yr). (P14)
12. Windows: confirm "ship unsigned for v0, defer EV cert" decision. (P15)
13. Linux: confirm AppImage as v0 format. (P16)
14. Generate `.icns`, `.ico`, and multi-size PNG icon assets from the existing brand mark. (P17)

### Out of prep scope (defer until after v0 ships)
- gRPC / GraphQL subscriptions / WebSocket support in core
- electron-updater + auto-update infrastructure
- Tabs / multi-window
- Windows EV code signing
- Additional Linux package formats
- Embedded scripting runtime
- CLI maturity TODOs (zwag run auth/inputs/body/parallel/--json) — independent of desktop, can ship in either order

## Risks

- **macOS signing/notarization friction**. Apple's notarization service has been flaky historically (slow turnarounds, opaque rejections). Mitigation: get the cert + a hello-world signed build working before committing to ship. Allow extra time.
- **Electron security defaults**. Renderer must run with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All Node-power lives in main. IPC payloads validated. (Standard Electron security baseline — well documented.)
- **Bundle size growth from monorepo deps**. `electron-builder` will pull every transitive prod dep into the package. Audit `apps/desktop/package.json` to keep it lean. Goal: ≤ 200MB installer.
- **`@zwaggen/core` accidentally depending on browser globals**. The transport abstraction (P1) explicitly fixes this; verify with a tsc target of `node` for the desktop main process.
- **Drift between Zwaggen Web and Zwaggen Desktop UX**. Mitigation: same React codebase. The only conditional surface is the storage + transport abstraction. No "if (electron)" UI branches in components.
- **TODO debt during prep phase**. Doing 14 prep items before any desktop binary exists can feel like going dark. Mitigation: each prep item ships independently and adds standalone value (saved presets, per-env servers, transport abstraction = better testability). The desktop app is the harvest, not the only crop.
