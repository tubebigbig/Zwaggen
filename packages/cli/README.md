# @zwaggen/cli (zwag)

CI CLI for Zwaggen specs.

## Install (workspace)

This is a workspace-internal package; build with:

    pnpm --filter @zwaggen/cli build

## Commands

### `zwag diff <base.json> <current.json>`

Diffs two Zwaggen spec files. Prints breaking + non-breaking changes. Exit 1 if
any breaking change is present, 0 otherwise.

### `zwag run <spec.json> [--base-url <url>] [--filter <regex>]`

Runs every endpoint in the spec against `spec.info.baseUrl` (or `--base-url`
if given). Smoke test: path params are substituted with the literal string
`"1"`, no body is sent, no authentication is wired (see Limitations below).
Reports PASS/FAIL per endpoint. Exit 1 if any endpoint fails.

`--filter` takes a regex; only endpoints whose `METHOD /path` matches are
run (e.g. `--filter '^GET /users'`).

An endpoint passes iff the request completes without a network error and
every assertion attached to the endpoint passes. With no assertions, any
successful HTTP response (including 4xx/5xx) counts as PASS; add
`assertions.expectedStatus` in the spec to gate on status.

## Exit codes

- `0`: success
- `1`: failures found (broken endpoints for `run`; breaking changes for `diff`)
- `2`: CLI misuse (missing file, bad JSON, no base URL, etc.)

## Limitations (v0.1.0)

- No authentication. Endpoints that require auth will return 401/403 and FAIL
  (or PASS silently if no `expectedStatus` assertion is set).
- Path params are hard-coded to `"1"`. Endpoints requiring real IDs will 404.
- Request bodies are not sent.
- Sequential execution only.
- Text output only (no `--json`).

Follow-ups are tracked in `docs/TODO.md` under "Follow-up from shipped work".
