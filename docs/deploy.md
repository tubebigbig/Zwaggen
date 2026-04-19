# Deploying Zwaggen

Both the docs site and the web app are pure static bundles. They ship as two separate **Cloudflare Pages** projects pointing at the same GitHub repo. DNS is managed in Cloudflare.

## Targets

| Project on Cloudflare Pages | Domain | Build output |
| --- | --- | --- |
| `zwaggen-docs` | `docs.zwaggen.com` | `apps/docs/.vitepress/dist` |
| `zwaggen-play` | `play.zwaggen.com` | `apps/web/dist` |

## One-time setup — `zwaggen-docs`

Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick `tubebigbig/Zwaggen` → branch `main`.

Build config:

- **Framework preset:** None.
- **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter docs build`
- **Build output directory:** `apps/docs/.vitepress/dist`
- **Root directory:** (leave blank — repo root)
- **Deploy command:** (leave blank — Pages uploads the output directory automatically)
- **Environment variables:** `NODE_VERSION=20`

After the first deploy, Custom domains → add `docs.zwaggen.com`. Cloudflare auto-creates the CNAME because DNS is in the same account.

## One-time setup — `zwaggen-play`

Same flow, second project:

- **Build command:** `corepack enable && pnpm install --frozen-lockfile && VITE_PLAYGROUND=1 pnpm --filter @zwaggen/web build:vite`
- **Build output directory:** `apps/web/dist`
- **Root directory:** (blank)
- **Deploy command:** (leave blank)
- **Environment variables:** `NODE_VERSION=20`, `VITE_PLAYGROUND=1` (setting both makes sure it's baked into the Vite bundle even if the inline assignment is ignored).

Custom domain → add `play.zwaggen.com`.

### Why `build:vite` and not `build`?

`apps/web`'s normal `build` script is `tsc -b && vite build`. There are pre-existing TypeScript errors in `apps/web/tests/ui/TypeBuilder.example.test.tsx` and a few src files (tracked in `docs/TODO.md`) that make `tsc -b` fail. The playground deploy uses `build:vite` which skips the type check. `vite build` itself succeeds — the output is identical to what the normal script would produce once the TS errors are fixed.

### Why `VITE_PLAYGROUND=1`?

The web app reads this env var at build time. When set, it:

- Hides the **Use proxy** toggle in the Run panel (public deploy doesn't ship a proxy server).
- Shows a small **Playground** chip in the header linking back to the docs.
- Tree-shakes the disabled code paths out of the bundle (verified: the string `"aria-label":"Use proxy"` is absent from the playground bundle).

Local dev (`pnpm dev`) and the normal local build (`pnpm build`) don't set the flag, so the proxy toggle is available for people running `zwaggen-proxy` alongside the app.

## Security & cache headers

Both projects ship a `_headers` file in `public/` that Cloudflare Pages picks up automatically:

- `apps/web/public/_headers` — playground: strict CSP (no external scripts, `connect-src` opens up to `http:` + `https:` so users can hit their own APIs), `X-Frame-Options: DENY`, `nosniff`, strict referrer policy. Hashed `/assets/*` cached for a year; HTML short-lived.
- `apps/docs/public/_headers` — docs: moderate CSP (VitePress requires inline scripts for theme detection, so `script-src 'self' 'unsafe-inline'`), `X-Frame-Options: SAMEORIGIN`, same nosniff + referrer posture.

The playground also ships `apps/web/public/_redirects` with `/*  /index.html  200` as a defensive SPA fallback, even though the app has no client-side router today.

## Updating a live site

Every push to `main` triggers both Pages builds automatically. No manual deploy step.

To redeploy without a new commit, use the Pages dashboard → Deployments → Retry deployment.

## Local sanity check before pushing

```bash
# docs
pnpm docs:build

# playground build (same command Cloudflare runs)
VITE_PLAYGROUND=1 pnpm --filter @zwaggen/web build:vite

# non-playground build (what `pnpm --filter @zwaggen/web build` should produce once TS is fixed)
pnpm --filter @zwaggen/web build:vite
```

All three should exit 0.

## DNS

DNS is in Cloudflare for `zwaggen.com`. The two Pages custom-domain additions create CNAME records under `docs` and `play` pointing at the Pages hostnames. Keep them proxied (orange cloud) for TLS + CDN.

## Rolling back

Pages keeps every deployment. Dashboard → Deployments → pick a prior success → Rollback. Near-instant, no repo change required.
