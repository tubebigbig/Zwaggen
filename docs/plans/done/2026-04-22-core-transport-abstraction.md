# Transport abstraction in `@zwaggen/core` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an injectable `Transport` to `sendRequest` so the future Electron app can route HTTP through Node main via IPC, without changing behaviour for any existing consumer (web playground, CLI).

**Architecture:** New `transport.ts` module exports `Transport` type, `TransportRequest`/`TransportResponse` shapes, and a `fetchTransport` default that wraps `globalThis.fetch`. `sendRequest` gains an optional `opts: { transport?: Transport }` second arg; when omitted, `fetchTransport` is used and behaviour is byte-for-byte identical to today. Proxy URL prefixing, latency timing, JSON parsing, and `classifyError` all stay in `sendRequest` — the transport just sees a final URL and returns a response.

**Tech Stack:** TypeScript, vitest, `@zwaggen/core` package, no new deps.

---

### Spec

See `docs/specs/active/2026-04-22-core-transport-abstraction.md` for full context. Key constraints:

- All existing tests in core, web, cli must pass unchanged.
- New arg is optional — call sites in `apps/web/src/runner/batch.ts`, `apps/web/src/ui/RunPanel.tsx`, `packages/cli/src/commands/run.ts` are not modified.
- The transport interface is a function type, not a class. Smallest possible surface.
- Proxy routing stays in `sendRequest`; transport sees the final (already-proxied if applicable) URL.

---

### Task 1: Write failing tests for `fetchTransport`

**Files:**
- Create: `packages/core/tests/runner/transport.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// packages/core/tests/runner/transport.test.ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fetchTransport } from '../../src/runner/transport';

beforeEach(() => {
  globalThis.fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
    JSON.stringify({ hello: 'world' }),
    { status: 201, statusText: 'Created', headers: { 'content-type': 'application/json', 'x-custom': 'yes' } },
  )) as any;
});
afterEach(() => vi.restoreAllMocks());

test('fetchTransport calls global fetch with method/headers/body', async () => {
  const resp = await fetchTransport({
    method: 'POST',
    url: 'http://api.example/users',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    bodyText: '{"name":"a"}',
  });
  const call = (globalThis.fetch as any).mock.calls[0];
  expect(call[0]).toBe('http://api.example/users');
  expect(call[1].method).toBe('POST');
  expect(call[1].headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer t' });
  expect(call[1].body).toBe('{"name":"a"}');
  expect(resp.ok).toBe(true);
  expect(resp.status).toBe(201);
  expect(resp.statusText).toBe('Created');
  expect(resp.headers['content-type']).toBe('application/json');
  expect(resp.headers['x-custom']).toBe('yes');
  expect(resp.rawText).toBe('{"hello":"world"}');
});

test('fetchTransport sends no body when bodyText is undefined', async () => {
  await fetchTransport({ method: 'GET', url: 'http://api.example/x', headers: {} });
  const call = (globalThis.fetch as any).mock.calls[0];
  expect(call[1].body).toBeUndefined();
});

test('fetchTransport propagates network errors', async () => {
  globalThis.fetch = vi.fn(async () => { throw new TypeError('fetch failed'); }) as any;
  await expect(fetchTransport({ method: 'GET', url: 'http://api.example/x', headers: {} }))
    .rejects.toBeInstanceOf(TypeError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zwaggen/core test -- transport.test.ts`
Expected: FAIL with "Cannot find module '../../src/runner/transport'"

- [ ] **Step 3: Commit (red state)**

```bash
git add packages/core/tests/runner/transport.test.ts
git commit -m "test(core): add failing tests for fetchTransport"
```

---

### Task 2: Implement `transport.ts` to make Task 1's tests pass

**Files:**
- Create: `packages/core/src/runner/transport.ts`

- [ ] **Step 1: Write the implementation**

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

- [ ] **Step 2: Run Task 1's tests to verify they pass**

Run: `pnpm --filter @zwaggen/core test -- transport.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 3: Re-export from package barrel**

Edit `packages/core/src/index.ts`. Add a single new line in the runner block, alphabetised against the existing entries:

```ts
export * from './runner/substitute';
export * from './runner/transport';   // <-- new
```

(Existing list around line 21–28; place `transport` after `substitute` to keep the section sorted.)

- [ ] **Step 4: Verify barrel typecheck**

Run: `pnpm --filter @zwaggen/core typecheck`
Expected: clean (no TS errors).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runner/transport.ts packages/core/src/index.ts
git commit -m "feat(core): add Transport interface and fetchTransport default"
```

---

### Task 3: Write failing tests for `sendRequest` with custom transport

**Files:**
- Modify: `packages/core/tests/runner/transport.test.ts` (append, do not duplicate file)

- [ ] **Step 1: Append the new tests to the existing file**

Add these after the three `fetchTransport` tests already in the file:

```ts
import { sendRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';
import type { Transport, TransportRequest } from '../../src/runner/transport';

const ep: Endpoint = {
  id: 'e1', method: 'GET', path: '/users/{id}',
  pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
  queryParams: [], headers: [], requestBody: null,
  responses: [{ status: 200, type: { kind: 'object', fields: [] } }],
  auth: 'inherit', useProxy: 'inherit',
};

test('sendRequest with custom transport uses it instead of fetch', async () => {
  const seen: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    seen.push(req);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      rawText: '{"id":7}',
    };
  };
  // fetch must NOT be called when a custom transport is supplied
  const fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as any;

  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '7' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  }, { transport });

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(seen).toHaveLength(1);
  expect(seen[0].url).toBe('http://api/users/7');
  expect(seen[0].method).toBe('GET');
  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: 7 });
  expect(res.rawText).toBe('{"id":7}');
  expect(typeof res.latencyMs).toBe('number');
});

test('sendRequest classifies errors thrown from the custom transport', async () => {
  const transport: Transport = async () => { throw new TypeError('boom'); };
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  }, { transport });
  expect(res.ok).toBe(false);
  expect(res.error?.kind).toBe('cors-or-network');
  expect(typeof res.latencyMs).toBe('number');
});

test('sendRequest forwards proxy-wrapped URL to the custom transport', async () => {
  const seen: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    seen.push(req);
    return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
  };
  const proxyEp: Endpoint = { ...ep, useProxy: true };
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  await sendRequest({
    spec, endpoint: proxyEp, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
    proxyUrl: 'http://localhost:9999',
  }, { transport });
  expect(seen[0].url).toBe('http://localhost:9999/proxy?url=' + encodeURIComponent('http://api/users/1'));
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @zwaggen/core test -- transport.test.ts`
Expected: the three new tests FAIL because `sendRequest` doesn't yet accept a second argument and ignores `opts.transport`. The `fetchTransport` tests still pass.

- [ ] **Step 3: Commit (red state)**

```bash
git add packages/core/tests/runner/transport.test.ts
git commit -m "test(core): add failing tests for sendRequest custom transport"
```

---

### Task 4: Refactor `sendRequest` to honour `opts.transport`

**Files:**
- Modify: `packages/core/src/runner/send.ts:114-154` (the `sendRequest` function only — `buildRequest` and helpers above it are unchanged)

- [ ] **Step 1: Update the import block at the top of `send.ts`**

Add the transport import:

```ts
import { Endpoint, Spec } from '../schema/types';
import { substitute } from './substitute';
import { applyAuth } from './auth';
import { classifyError, ClassifiedError } from './classify-error';
import { fetchTransport, type Transport } from './transport';   // <-- new
```

- [ ] **Step 2: Replace the `sendRequest` function body**

Replace the entire `export async function sendRequest(req: RunRequest): Promise<RunResult> { ... }` block (lines 114–154) with:

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

- [ ] **Step 3: Run all core tests to verify everything passes**

Run: `pnpm --filter @zwaggen/core test`
Expected: ALL green — `transport.test.ts` (6 tests), `send.test.ts`, `send.proxy.test.ts`, `buildRequest.test.ts`, and every other core test.

- [ ] **Step 4: Run core typecheck**

Run: `pnpm --filter @zwaggen/core typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runner/send.ts
git commit -m "refactor(core): route sendRequest through injectable Transport"
```

---

### Task 5: Verify downstream consumers (web + cli) still build and pass

**Files:** none modified — this task is verification only.

- [ ] **Step 1: Build core so downstream packages pick up the new `dist/`**

Run: `pnpm --filter @zwaggen/core build`
Expected: clean dist build (no TS errors).

- [ ] **Step 2: Typecheck and test apps/web**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: clean. The existing `RunPanel.tsx` and `batch.ts` call sites use the one-arg form and should compile/run unchanged.

- [ ] **Step 3: Typecheck, build, and test the CLI**

Run: `pnpm --filter @zwaggen/cli build && pnpm --filter @zwaggen/cli test`
Expected: clean. `commands/run.ts` uses the one-arg form and should be unaffected.

- [ ] **Step 4: Full repo typecheck + test as a final safety net**

Run from repo root: `pnpm -r typecheck && pnpm -r test`
Expected: every package green.

- [ ] **Step 5: Commit nothing**

This task makes no edits — just verifies the refactor is non-breaking. If any step fails, return to the relevant prior task and fix.

---

### Task 6: Tick TODO and move spec + plan to `done/`

**Files:**
- Modify: `docs/TODO.md`
- Move: `docs/specs/active/2026-04-22-core-transport-abstraction.md` → `docs/specs/done/`
- Move: `docs/plans/active/2026-04-22-core-transport-abstraction.md` → `docs/plans/done/`

- [ ] **Step 1: Tick the TODO entry**

Open `docs/TODO.md`. Find the line:

```
- [ ] _(prep for Desktop)_ Transport abstraction in `@zwaggen/core` — refactor `sendRequest` to take an injectable transport; default = current fetch behaviour; lets Electron renderer route through Node main process via IPC.
```

Replace it with:

```
- [x] _(prep for Desktop)_ Transport abstraction in `@zwaggen/core` — `sendRequest(req, { transport })` accepts a custom transport; default `fetchTransport` preserves existing behaviour. See `docs/plans/done/2026-04-22-core-transport-abstraction.md`.
```

Update the "Last updated" date at the top of `docs/TODO.md` to `2026-04-22 (core-transport-abstraction)`.

- [ ] **Step 2: Move spec and plan to done/**

```bash
git mv docs/specs/active/2026-04-22-core-transport-abstraction.md docs/specs/done/
git mv docs/plans/active/2026-04-22-core-transport-abstraction.md docs/plans/done/
```

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: ship core-transport-abstraction — move spec+plan to done, tick TODO"
```

---

## Self-Review Checklist (controller, after all tasks complete)

- All six tasks ticked.
- `pnpm -r build && pnpm -r typecheck && pnpm -r test` clean from repo root.
- No new exports beyond `Transport`, `TransportRequest`, `TransportResponse`, `fetchTransport`.
- No call sites modified outside `packages/core/src/runner/send.ts` and `packages/core/src/index.ts`.
- Branch `plan/core-transport-abstraction` ready to push.
