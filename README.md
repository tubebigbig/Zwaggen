# Zwaggen

Typed API spec builder + runtime tester. Combines Postman (request testing), Swagger (API docs), and Zod (runtime type validation) into one browser app.

- **App:** [play.zwaggen.com](https://play.zwaggen.com) — hosted playground, no install.
- **Local install:** `npx @zwaggen/web` — see [docs.zwaggen.com/installation](https://docs.zwaggen.com/installation).
- **Docs:** [docs.zwaggen.com](https://docs.zwaggen.com).
- **CLI:** `npx @zwaggen/cli --help`.

## Contributing / running from source

For contributors working on the Zwaggen codebase itself. Regular users should use the npm packages above.

**Prerequisites:** Node ≥ 20, pnpm ≥ 10, git, a Chromium browser.

```bash
git clone https://github.com/tubebigbig/Zwaggen.git
cd Zwaggen
pnpm install
```

**Run the web app in dev mode:**

```bash
pnpm dev
```

Vite starts on `http://localhost:5173`.

**Run the docs site in dev mode:**

```bash
pnpm docs:dev
```

VitePress starts on `http://localhost:5174` by default.

**Run the bundled CORS proxy:**

```bash
pnpm --filter zwaggen-proxy dev
```

**Validate changes:**

```bash
pnpm -r lint      # tsc --noEmit across every workspace
pnpm -r test      # vitest across every workspace
pnpm --filter @zwaggen/web e2e   # Playwright e2e
```

**Project invariants:** See `docs/rules/` and `CLAUDE.md` at the repo root.

**Release & deploy flow:** `docs/plans/done/2026-04-19-release-deploy-flow.md` documents the `release.yml` workflow. The `docs/` site is deployed via a separate `deploy-docs.yml` workflow that FF-pushes `main` → `docs`; Cloudflare Pages watches the `docs` branch.

## License

[MIT](./LICENSE) © 2026 Victor Liang
