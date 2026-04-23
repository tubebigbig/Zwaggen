---
title: Zwaggen Desktop
description: Cross-platform Electron app for editing specs and running requests without CORS — coming soon.
---

# Zwaggen Desktop

::: tip Coming Soon
Zwaggen Desktop is in active development and will be released soon. Watch the [GitHub repository](https://github.com/tubebigbig/Zwaggen) for the announcement.
:::

A native desktop app for editing specs and running requests against any API, with **no CORS limitations**. The hosted [Zwaggen Web](https://play.zwaggen.com) is great for browsing the spec builder UX and generating specs, but every cross-origin request hits browser CORS — which most APIs reject without explicit allow-list rules. Zwaggen Desktop runs requests through the OS network stack instead, the same way curl or Postman does.

## Why you'll want it

- **CORS-free API testing** — point an endpoint at any URL and run it. No proxy, no extension, no browser flag, no server-side allow-list. The request goes out the same way `curl` does.
- **Native file dialogs** — open and save `.zwag` specs with your OS's real picker.
- **`.zwag` file association** — double-click a spec in Finder/Explorer to open it in Zwaggen.
- **Recent files in the File menu** — backed by the OS recent-docs surface (macOS dock right-click, Windows jump list).
- **Cross-platform** — macOS (Intel + Apple Silicon), Windows, Linux.
- **Local-first, no telemetry** — your specs stay on your disk; nothing phones home.

## Until it ships

Use [Zwaggen Web](https://play.zwaggen.com) for spec editing and demo requests, plus the [`@zwaggen/cli`](/installation) for headless / CI runs. Both work today.
