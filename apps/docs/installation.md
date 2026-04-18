# Installation & Requirements

## Prerequisites

- **Node.js ≥ 20.** Check with `node --version`. Install from [nodejs.org](https://nodejs.org) or via `nvm`.
- **pnpm ≥ 10.** Zwaggen is a pnpm monorepo. Install with `npm install -g pnpm` or via [pnpm.io](https://pnpm.io/installation).
- **A modern browser.** Chromium-based (Chrome, Edge, Brave, Arc) or current Firefox. Safari is unsupported — it lacks some of the `showOpenFilePicker` / `showSaveFilePicker` APIs the spec-versioning flow relies on; a fallback upload/download path works, but the file-handle flow does not.
- **Git**, for cloning the repo.

## Clone and install

```bash
git clone https://github.com/vliang/Zwaggen.git
cd Zwaggen
pnpm install
```

## Run the app (development)

```bash
pnpm dev
```

Vite prints a local URL (by default `http://localhost:5173`). Open it in a supported browser. The app loads with an empty spec; [Quickstart](/quickstart) walks through creating one.

## Build for production

```bash
pnpm build
```

Produces a static bundle under `apps/web/dist/`. Serve it with any static host — no server-side logic is required.

## Run the docs site locally

```bash
pnpm docs:dev     # dev server with HMR
pnpm docs:build   # produce static site
pnpm docs:preview # preview the built site
```

## Optional: CORS proxy

If you're hitting APIs that don't send permissive CORS headers, run the helper proxy:

```bash
npx zwaggen-proxy
```

Default port is `8787`. Point the app's proxy setting at it. See [CORS Proxy](/guide/cors-proxy) for details.

## Troubleshooting

- **`pnpm: command not found`** — install pnpm globally (`npm install -g pnpm`) or enable corepack (`corepack enable`).
- **`Unsupported engine`** warning on install — check your Node version. `pnpm` requires Node ≥ 18, and Zwaggen requires ≥ 20.
- **`showOpenFilePicker is not a function`** — you're on a browser without the File System Access API. Firefox is fine for in-memory use; for the "save to disk" file-handle flow, use a Chromium browser.
- **Install hangs on `postinstall`** — one of the workspaces may be trying to fetch Playwright browsers. Run `pnpm --filter web install --ignore-scripts` if you only need the app, not e2e tests.
