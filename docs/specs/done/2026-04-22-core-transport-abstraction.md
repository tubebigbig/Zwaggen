# Spec — Transport abstraction in `@zwaggen/core`

## Problem

`sendRequest` in `packages/core/src/runner/send.ts` is hardcoded to `globalThis.fetch`. That works fine in the browser playground and in the Node-based CLI, but it blocks the Electron desktop app from doing the one thing it exists to do: bypass browser CORS.

In the planned Electron architecture (see `docs/specs/active/2026-04-22-zwaggen-desktop.md`), the renderer process runs the existing `apps/web` UI under a strict CSP (`connect-src 'none'`). Renderer code cannot call `fetch()` to arbitrary origins. The only legitimate path out is IPC → Node main process → real HTTP. To make that swap clean, `sendRequest` needs to accept an injectable transport rather than reaching for `globalThis.fetch` directly.

This is the first of three Electron prep jobs. It has zero UI surface and zero behavioural change for existing consumers (web playground, CLI). It's a pure refactor that adds a seam.

## Success criteria

- A `Transport` function-type alias is exported from `@zwaggen/core`, taking a `TransportRequest` and returning `Promise<TransportResponse>`.
- A `fetchTransport` default implementation is exported, wrapping `globalThis.fetch` with exactly the same semantics `sendRequest` has today.
- `sendRequest` accepts an optional second argument `opts?: { transport?: Transport }`. When omitted, behaviour is byte-for-byte identical to the current implementation. When provided, the custom transport replaces the fetch call.
- All existing `sendRequest` call sites (`apps/web/src/runner/batch.ts`, `apps/web/src/ui/RunPanel.tsx`, `packages/cli/src/commands/run.ts`) continue working without modification — the new arg is optional.
- All existing tests (`packages/core/tests/runner/send.test.ts`, `send.proxy.test.ts`, `buildRequest.test.ts`, `apps/web/tests/runner/batch.test.ts`) pass unchanged.
- Three new behaviours are covered by tests:
  1. `fetchTransport` calls `globalThis.fetch` with `{ method, headers, body }` matching the built request, reads `await resp.text()`, and returns `{ ok, status, statusText, headers, rawText }`.
  2. `sendRequest` with a custom transport: calls the transport with the post-proxy URL, includes its response in the returned `RunResult` (status/headers/body/rawText/latencyMs), and parses JSON the same way as the default path.
  3. `sendRequest` with a custom transport that throws: classifies the error via the existing `classifyError` and returns `RunResult` with `ok: false` and a populated `error`.
- Public API barrel (`packages/core/src/index.ts`) re-exports the new types.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` all green from the repo root.
- TODO entry "Transport abstraction in `@zwaggen/core`" ticked.

## Out of scope

- **Wiring the transport into apps/web or the CLI.** They keep using the default. The desktop app is the only consumer that will inject a custom transport, and that lands with the desktop project itself.
- **Routing proxy decisions through the transport.** `sendRequest` continues to compute the proxy-wrapped URL itself; the transport just sees a final absolute URL. Keeping proxy concerns in `sendRequest` keeps the transport interface stupid (one call, one response) and matches the principle that the transport is an HTTP I/O primitive, not a Zwaggen concept.
- **AbortSignal / cancellation.** The current `sendRequest` doesn't support cancellation either; adding it is a separate feature.
- **Streaming request or response bodies.** `bodyText: string | undefined` and `rawText: string` mirror the current shape. Binary/multipart bodies are not supported today and stay out of scope.
- **Per-call timeouts.** Same as above — the existing API has no timeout knob; adding one is its own feature.
- **Cookie jars, credential stores, redirect customization.** These belong to the consumer (default fetch handles them per-platform; Electron's Node http handles them differently — that's the Electron app's concern).
- **Bundling/runtime split.** The transport interface is universal. `fetchTransport` uses `globalThis.fetch` which is available in modern Node (≥ 18), Bun, Deno, browsers — same surface `@zwaggen/core` already assumes.
- **User-facing docs.** This is an internal seam; nothing changes for users until the desktop app ships. Update internal architecture comments only.

## Approach

### Files

- **Create** `packages/core/src/runner/transport.ts` — the new `Transport` type, `TransportRequest`, `TransportResponse`, and `fetchTransport` impl. Co-located with `send.ts` because they're the same concern.
- **Modify** `packages/core/src/runner/send.ts` — change `sendRequest`'s signature from `(req: RunRequest)` to `(req: RunRequest, opts?: { transport?: Transport })`; replace the inline `fetch()` block with a call to the supplied transport (or `fetchTransport` by default). The proxy-URL prefixing, latency timing, JSON parsing, and `classifyError` calls all stay in `sendRequest`.
- **Modify** `packages/core/src/index.ts` — add `export * from './runner/transport';`.
- **Create** `packages/core/tests/runner/transport.test.ts` — unit tests for `fetchTransport` and for `sendRequest` with a custom transport (success path + thrown error path).
- **Untouched** call sites: `apps/web/src/runner/batch.ts`, `apps/web/src/ui/RunPanel.tsx`, `packages/cli/src/commands/run.ts`. They keep passing one arg.

### Interface shape

```ts
// packages/core/src/runner/transport.ts
export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawText: string;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export const fetchTransport: Transport = async (req) => {
  const resp = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.bodyText,
  });
  const rawText = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });
  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
    headers,
    rawText,
  };
};
```

### `sendRequest` after the refactor

```ts
export async function sendRequest(
  req: RunRequest,
  opts?: { transport?: Transport },
): Promise<RunResult> {
  const built = buildRequest(req);
  const transport = opts?.transport ?? fetchTransport;

  let target = built.url;
  if (built.useProxy) {
    const proxy = req.proxyUrl ?? 'http://localhost:4801';
    target = `${proxy}/proxy?url=${encodeURIComponent(built.url)}`;
  }

  const start = performance.now();
  try {
    const resp = await transport({
      method: built.method,
      url: target,
      headers: built.headers,
      bodyText: built.bodyText,
    });
    const latencyMs = Math.round(performance.now() - start);
    let body: unknown;
    try { body = JSON.parse(resp.rawText); } catch { body = undefined; }
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
      body,
      rawText: resp.rawText,
      latencyMs,
      missingVars: built.missingVars,
    };
  } catch (err) {
    return {
      ok: false,
      error: classifyError(err, { useProxy: built.useProxy }),
      latencyMs: Math.round(performance.now() - start),
      missingVars: built.missingVars,
    };
  }
}
```

### Why an `opts` object instead of a positional arg

Future prep work may add more knobs to `sendRequest` (timeout, abort signal, custom user-agent for the desktop). An `opts` object keeps that growth path open without churning the call signature again. Even though v1 has only one option, the small overhead is worth it.

### Why a function type instead of a class/interface-with-method

`Transport` is one operation. A function type is the smallest surface that expresses "give me a request, get a response". Consumers can implement with a plain `async` function (`async (req) => ipcInvoke('http', req)`), no class boilerplate. We can always promote to an object with multiple methods later if the surface needs to grow (e.g. `transport.cancel(id)`).

### Why proxy stays out of the transport

The proxy is a Zwaggen-specific deployment concern: the URL `http://localhost:4801/proxy?url=...` is a Zwaggen artifact. Transports are generic HTTP I/O. Keeping proxy URL construction in `sendRequest` means a desktop transport doesn't need to understand that `useProxy: true` means "rewrite the URL"; it just gets a final URL and sends it. (And in the desktop app, `useProxy` becomes irrelevant anyway because Node's HTTP doesn't have CORS.)

### Test plan

`packages/core/tests/runner/transport.test.ts`:

1. **`fetchTransport` calls fetch with the right args.** Mock `globalThis.fetch`; call `fetchTransport({ method: 'POST', url: 'http://x/y', headers: { a: 'b' }, bodyText: '{"k":1}' })`; assert the mock was called with `('http://x/y', { method: 'POST', headers: { a: 'b' }, body: '{"k":1}' })` and the returned object matches the expected shape.

2. **`sendRequest` with custom transport — success.** Build a typical `RunRequest`. Pass an inline transport that resolves to a fixed `TransportResponse`. Assert `RunResult` carries those fields through, JSON body is parsed, latencyMs is set.

3. **`sendRequest` with custom transport — thrown error.** Same as above but transport throws `new TypeError('boom')`. Assert `RunResult.ok === false`, `RunResult.error.kind === 'cors-or-network'`, latencyMs still set.

4. **`sendRequest` with custom transport — proxy URL is forwarded.** Set `useProxy: true` on the endpoint. Assert the transport receives `req.url` starting with `http://localhost:4801/proxy?url=` (or the configured `proxyUrl`).

The existing `send.test.ts` and `send.proxy.test.ts` continue covering the default-transport path because they don't pass an `opts.transport` — they exercise the `fetchTransport` branch.

### Risks

- **Type inference at call sites.** Existing `sendRequest({...})` calls pass one arg. TypeScript should infer `opts` as `undefined` automatically. If any call site uses tuple destructuring or generics that break with the optional second arg, adjust there. Low risk because all call sites are simple direct invocations.
- **Public API surface.** Once `Transport` is exported, removing or reshaping it is a breaking change. Since `@zwaggen/core` isn't published to npm yet (still bundled into `cli`, kept private per TODO), this risk is theoretical for now. Treat the v1 shape as provisional; revisit when the package gets published.
- **Behavioural drift.** The riskiest part is mismatching `fetchTransport` against the inline fetch it replaces. The acceptance bar is "all existing tests pass unchanged" — that's the regression net.
- **`globalThis.fetch` availability.** Same constraint the package already has (Node ≥ 18, modern browsers). No new requirement.

## Done definition

- New file `packages/core/src/runner/transport.ts` with `Transport`, `TransportRequest`, `TransportResponse`, `fetchTransport`.
- `sendRequest` signature gains optional `opts: { transport?: Transport }`; default path uses `fetchTransport`.
- `packages/core/src/index.ts` re-exports the transport module.
- New test file `packages/core/tests/runner/transport.test.ts` with the four scenarios above.
- All existing tests in core, web, and cli green.
- `pnpm build && pnpm typecheck && pnpm test` clean from repo root.
- TODO entry ticked, plan + spec moved to `done/`.
- Branch `plan/core-transport-abstraction` pushed; user opens PR.
