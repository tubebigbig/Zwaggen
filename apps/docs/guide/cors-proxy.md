---
description: When the target API blocks the browser's Origin header, route requests through the Zwaggen CORS proxy.
---

# CORS Proxy

Browsers block cross-origin responses unless the server opts in. Most of your APIs probably won't opt in to every developer's laptop, so Zwaggen ships a dev-time proxy.

## What it is

`zwaggen-proxy` is a small Node server (source in `packages/proxy/`). It forwards your request to the real API and returns the response with permissive CORS headers so the browser accepts it.

## When you need it

- The target API doesn't send `Access-Control-Allow-Origin` (or doesn't include your origin).
- You're seeing a browser error like "CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource."
- You get `status: 0` with no body in the Run panel — a classic CORS-blocked signature.

## When you don't

- **Same-origin** APIs (hosted on the same origin as the Zwaggen app).
- Public APIs that advertise permissive CORS — JSONPlaceholder, GitHub's public API, most OpenAPI-hosting tools.
- APIs you can configure to add `Access-Control-Allow-Origin` for development.

## Running it

```bash
npx zwaggen-proxy
```

Default port is `8787`. Override with `--port`:

```bash
npx zwaggen-proxy --port 9001
```

Leave this running in its own terminal.

## Enabling proxy mode in the app

- In the Run panel, toggle **Use proxy** on.
- Set the proxy URL to `http://localhost:8787` (adjust if you used `--port`).
- Send as usual.

The app rewrites outgoing requests to `POST http://localhost:8787/?url=<original-url>` with the original method, headers, and body forwarded. You'll see the real target URL in the URL preview; the proxy is a transparent hop.

## Safety

- **Don't deploy the proxy publicly.** It's an open relay — anyone with the URL can use it to make cross-origin requests from your server.
- The proxy does no authentication. If you have to expose it beyond `localhost`, put it behind VPN/firewall.
- The proxy does not log request bodies, but the Node host's logs may — be aware when testing with real credentials.

## Troubleshooting

- **"Proxy returned 502"** — the target API refused the connection; the proxy forwards the error. Check the target is reachable.
- **"ECONNREFUSED"** in your browser DevTools network panel — the proxy isn't running, or you're using the wrong port.
- **Still CORS-blocked** — check the proxy URL is `http://` not `https://`, and that no browser extension is stripping your custom header.
