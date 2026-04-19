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
| `-h`, `--help`   |                | Show help.                                     |
| `-v`, `--version`|                | Print version.                                 |

## Examples

```bash
npx @zwaggen/web                 # default
npx @zwaggen/web --port 8080     # custom port
npx @zwaggen/web --host 0.0.0.0  # LAN-accessible
npx @zwaggen/web --no-open       # don't open browser
```

## What this is

The Zwaggen web app is a single-page React app — there's no backend.
Your specs and run history are stored in your browser's IndexedDB.
Closing the server doesn't lose data; reopening it on the same port
restores everything.

## Online version

The same app runs at [`play.zwaggen.com`](https://play.zwaggen.com) with
no install required. Use that if you don't want a local copy.

## Documentation

Full tutorial at [`docs.zwaggen.com`](https://docs.zwaggen.com).

## License

MIT.
