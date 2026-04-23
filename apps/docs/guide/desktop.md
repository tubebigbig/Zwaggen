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
- **Recents menu** — File → Open Recent, persisted to disk, integrated with the OS recent-docs surface (macOS dock right-click, Windows jump list).
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

Artifacts land in `apps/desktop/release/`. They are **unsigned**, so launching them triggers Gatekeeper / SmartScreen warnings. Installation guidance for general users will land here when official signed builds are available.

## Until it ships

Use [Zwaggen Web](https://play.zwaggen.com) for spec editing and demo requests, plus the [`@zwaggen/cli`](/installation) for headless / CI runs. Both work today.
