# @zwaggen/web

Zwaggen web app — a visual API spec designer + runner — packaged for
zero-install local use.

## Install / run

No global install needed:

```bash
npx @zwaggen/web
```

This boots a local server (default `http://127.0.0.1:4173`) and opens
your browser. Press Ctrl+C to stop.

**The CORS-bypass proxy is bundled in.** Flip the "Use proxy" toggle on any
endpoint and the request routes through the same Node process at `/proxy`
(same-origin → no CORS preflight). No second terminal, no second port.

Or install globally:

```bash
npm i -g @zwaggen/web
zwaggen-web
```

## Options

| Flag             | Default        | Description                                    |
| ---------------- | -------------- | ---------------------------------------------- |
| `--port <n>`     | `4173`         | Port to bind. If busy, scans upward for free.  |
| `--host <addr>`  | `127.0.0.1`    | Host to bind. Use `0.0.0.0` for LAN access.    |
| `--no-open`      | (off)          | Don't auto-open browser.                       |
| `--no-proxy`     | (off)          | Disable the bundled CORS proxy (no `/proxy`).  |
| `-h`, `--help`   |                | Show help.                                     |
| `-v`, `--version`|                | Print version.                                 |

## Examples

```bash
npx @zwaggen/web                 # default — proxy on
npx @zwaggen/web --port 8080     # custom port
npx @zwaggen/web --host 0.0.0.0  # LAN-accessible
npx @zwaggen/web --no-open       # don't open browser
npx @zwaggen/web --no-proxy      # serve SPA only, no /proxy route
```

## What this is

The Zwaggen web app is a single-page React app — there's no backend.
Your specs and run history are stored in your browser's IndexedDB.
Closing the server doesn't lose data; reopening it on the same port
restores everything.

The bundled CORS proxy is the same code as the standalone
[`@zwaggen/proxy`](https://www.npmjs.com/package/zwaggen-proxy) package,
mounted at `/proxy` on the same port. Use the standalone proxy when you
need it on a different host than the SPA; use the bundled one for
zero-config local development.

## Online version

The same app runs at [`play.zwaggen.com`](https://play.zwaggen.com) with
no install required. Cross-origin requests there hit browser CORS — for
real API testing without CORS, use `npx @zwaggen/web` locally.

## Documentation

Full tutorial at [`docs.zwaggen.com`](https://docs.zwaggen.com).

## License

MIT.
