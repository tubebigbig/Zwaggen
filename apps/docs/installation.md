---
description: How to run Zwaggen locally with a single npx command.
---

# Installation & Requirements

::: tip Don't want to install?
[**Try the playground at play.zwaggen.com**](https://play.zwaggen.com) — same app, no install, no proxy server. Your specs stay in your browser. Come back here when you want to test CORS-locked APIs or work fully offline.
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
npx @zwaggen/web --help             # show all options
```

Stop the server with `Ctrl+C`.

## Run the CLI

```bash
npx @zwaggen/cli --help
```

`@zwaggen/cli` is a companion tool for batch-running requests and diffing specs. See the CLI guide for details.

## Optional: CORS proxy

If you're hitting APIs that don't send permissive CORS headers, you'll need a local proxy. `@zwaggen/proxy` is coming soon as an npm package; in the meantime, you can run your own CORS proxy or run the bundled one by cloning the repo (see the repo `README.md` for contributor setup). Point the Zwaggen proxy setting at your proxy's URL. See [CORS Proxy](/guide/cors-proxy) for details.

## Troubleshooting

- **`unsupported engine`** warning on install — check Node ≥ 20 with `node --version`.
- **`EADDRINUSE`** — port 4173 is taken. Use `npx @zwaggen/web --port <n>` to pick another.
- **`showOpenFilePicker is not a function`** — you're on a browser without the File System Access API. Firefox is fine for in-memory use; for the "save to disk" file-handle flow, use a Chromium browser.
- **Browser didn't open** — check for `npx @zwaggen/web --no-open` in your shell history; without `--no-open`, the CLI auto-opens.
