---
description: When the target API blocks the browser's Origin header, route requests through the Zwaggen CORS proxy — bundled into npx @zwaggen/web since v0.2.0.
---

# CORS Proxy

::: tip Already running `npx @zwaggen/web`? You're done.
Since `@zwaggen/web` v0.2.0, the proxy is **bundled in**. The local server mounts `/proxy` on the same port as the SPA — flip the **Use proxy** toggle on any endpoint and the request routes through it. No extra install, no second terminal, no second port. Skip to [Enabling proxy mode in the app](#enabling-proxy-mode-in-the-app).

You only need the standalone proxy below if you want to run it on a different host than the SPA, or if you've launched with `npx @zwaggen/web --no-proxy`.
:::

::: tip Coming soon
Zwaggen Desktop runs requests through the OS network stack, so CORS doesn't apply at all and you won't need a proxy at all. See [Desktop](/guide/desktop). Until it ships, this guide covers the proxy approach for Zwaggen Web.
:::

Browsers block cross-origin responses unless the server opts in. Most APIs don't opt in to every developer's laptop, so Zwaggen ships a dev-time proxy.

## What it is

The proxy is a small Node server (source in `packages/proxy/`) that forwards your request to the real API and returns the response with permissive CORS headers so the browser accepts it.

Two ways to run it:

1. **Bundled (default)** — `npx @zwaggen/web` mounts the proxy at `/proxy` on the same port as the SPA. Same-origin → no CORS preflight.
2. **Standalone** — `npx @zwaggen/proxy` (or `npx zwaggen-proxy`) starts the proxy on its own port (`4801` by default). Useful when the SPA runs on a different host.

## When you need it

- The target API doesn't send `Access-Control-Allow-Origin` (or doesn't include your origin).
- You're seeing a browser error like "CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource."
- You get `status: 0` with no body in the Run panel — a classic CORS-blocked signature.

## When you don't

- **Same-origin** APIs (hosted on the same origin as the Zwaggen app).
- Public APIs that advertise permissive CORS — JSONPlaceholder, GitHub's public API, most OpenAPI-hosting tools.
- APIs you can configure to add `Access-Control-Allow-Origin` for development.

## Bundled proxy (default)

```bash
npx @zwaggen/web
```

Look for the startup log line: `Bundled CORS proxy: on (http://127.0.0.1:4173/proxy)`. The SPA auto-configures itself to use this URL — flip the **Use proxy** toggle on any endpoint and you're done.

To disable the bundled proxy (e.g. you want to test the SPA without it):

```bash
npx @zwaggen/web --no-proxy
```

The startup log changes to `Bundled CORS proxy: off (--no-proxy)`. Requests with **Use proxy** on will fall back to the standalone proxy URL (`http://localhost:4801`) — start `npx zwaggen-proxy` separately if you need it.

## Standalone proxy

```bash
npx zwaggen-proxy
```

Default port is `4801`. Override with `--port`:

```bash
npx zwaggen-proxy --port=9001
```

Leave it running in its own terminal.

## Enabling proxy mode in the app

- In the Run panel, toggle **Use proxy** on per endpoint, or set the spec-wide default in **Settings → Default proxy**.
- The proxy URL is auto-configured: `/proxy` (same-origin) when running under bundled mode, `http://localhost:4801` otherwise.
- Send as usual.

The app rewrites outgoing requests to `<proxy-url>/proxy?url=<original-url>` with the original method, headers, and body forwarded. You'll see the real target URL in the URL preview; the proxy is a transparent hop.

## Safety

- **Don't deploy the proxy publicly.** It's an open relay — anyone with the URL can use it to make cross-origin requests from your server.
- The proxy does no authentication. If you have to expose it beyond `localhost`, put it behind VPN/firewall.
- The proxy does not log request bodies, but the Node host's logs may — be aware when testing with real credentials.

## Troubleshooting

- **"Proxy returned 502"** — the target API refused the connection; the proxy forwards the error. Check the target is reachable.
- **"ECONNREFUSED"** in your browser DevTools network panel — the standalone proxy isn't running, or you're using the wrong port. (Bundled mode can't ECONNREFUSE — it's same-origin.)
- **Still CORS-blocked** — verify the proxy URL is reachable and that no browser extension is stripping your custom header. Check the startup log to confirm the bundled proxy is **on** (not `--no-proxy`).
