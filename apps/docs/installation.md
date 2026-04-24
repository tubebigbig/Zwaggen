---
description: How to run Zwaggen locally with a single npx command.
---

# Installation & Requirements

::: tip Don't want to install?
[**Try the playground at play.zwaggen.com**](https://play.zwaggen.com) — same app, no install. Cross-origin requests there hit browser CORS (no bundled proxy on the hosted page). Come back here when you want to test CORS-locked APIs or work fully offline.
:::

## Prerequisites

- **Node.js ≥ 20.** Check with `node --version`. Install from [nodejs.org](https://nodejs.org) or via `nvm`.
- **A modern browser.** Chromium-based (Chrome, Edge, Brave, Arc) or current Firefox. Safari is unsupported — it lacks some of the `showOpenFilePicker` / `showSaveFilePicker` APIs the spec-versioning flow relies on; a fallback upload/download path works, but the file-handle flow does not.

## Run Zwaggen

```bash
npx @zwaggen/web
```

That's it. `npx` downloads the published package, serves the pre-built SPA via `sirv` at `http://127.0.0.1:4173`, and opens the URL in your default browser.

### Flags

```bash
npx @zwaggen/web --port 8080        # custom port
npx @zwaggen/web --host 0.0.0.0     # bind all interfaces (LAN access)
npx @zwaggen/web --no-open          # don't auto-open browser
npx @zwaggen/web --no-proxy         # disable the bundled CORS proxy
npx @zwaggen/web --help             # show all options
```

Stop the server with `Ctrl+C`.

The startup log line `Bundled CORS proxy: on (URL/proxy)` confirms the bundled proxy is mounted; pass `--no-proxy` to skip it.

## Run the CLI

```bash
npx @zwaggen/cli --help
```

`@zwaggen/cli` is a companion tool for batch-running requests and diffing specs. See the CLI guide for details.

## CORS proxy

The bundled CORS proxy ships with `@zwaggen/web` since v0.2.0 — it's mounted at `/proxy` on the same port as the SPA. **Flip the "Use proxy" toggle on any endpoint and you're done** — no separate install, no second terminal.

For setups where the proxy needs to live on a different host (e.g. running the SPA on a tablet that hits a proxy on your desktop), the standalone `npx zwaggen-proxy` is also available. See [CORS Proxy](/guide/cors-proxy) for the full breakdown.

## Troubleshooting

- **`unsupported engine`** warning on install — check Node ≥ 20 with `node --version`.
- **`EADDRINUSE`** — port 4173 is taken. Use `npx @zwaggen/web --port <n>` to pick another.
- **`showOpenFilePicker is not a function`** — you're on a browser without the File System Access API. Firefox is fine for in-memory use; for the "save to disk" file-handle flow, use a Chromium browser.
- **Browser didn't open** — check for `npx @zwaggen/web --no-open` in your shell history; without `--no-open`, the CLI auto-opens.
