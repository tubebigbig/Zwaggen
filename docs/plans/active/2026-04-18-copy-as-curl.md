# Copy as cURL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy as cURL" button to the Try-it panel that writes a paste-ready shell command to the clipboard, reproducing the currently-resolved request, with secret env variables masked as `$NAME`.

**Spec:** `docs/specs/active/2026-04-18-copy-as-curl.md`

**Architecture:** Extract request construction from `sendRequest` into a pure `buildRequest(req)` helper. Add a pure `toCurl(built)` renderer in a new `runner/curl.ts`. Send path calls `buildRequest` then `fetch`; Copy path calls `buildRequest` then `toCurl` then `navigator.clipboard.writeText`. One source of truth — the copied command is guaranteed to match what the app would actually send.

**Tech Stack:** existing only — no new dependencies. Uses the browser's `navigator.clipboard` API; fallback is a `<textarea>` that auto-selects for manual copy.

---

## Rules Applied
No new rules. No existing rule is at risk.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/runner/send.ts` | Factor URL/header/body assembly into `buildRequest`; `sendRequest` calls it |
| Create | `apps/web/src/runner/curl.ts` | Pure `toCurl(built, { secretMask, proxyOn })` renderer |
| Modify | `apps/web/src/ui/icons.tsx` | Add `IconClipboard` if not present |
| Modify | `apps/web/src/ui/RunPanel.tsx` | Copy button + clipboard call + feedback state + fallback textarea |
| Create | `apps/web/tests/runner/buildRequest.test.ts` | Unit tests for the extracted builder |
| Create | `apps/web/tests/runner/curl.test.ts` | Unit tests for cURL rendering, quoting, masking |
| Create | `apps/web/tests/ui/RunPanel.curl.test.tsx` | Component test: clipboard, mask, fallback |

---

## Tasks

### Task 1: Extract `buildRequest` from `sendRequest`

**Files:**
- Modify: `apps/web/src/runner/send.ts`
- Create: `apps/web/tests/runner/buildRequest.test.ts`

**Acceptance criteria covered:** spec requirement 6 (one source of truth) — this refactor is the foundation that makes (7) achievable without drift.

- [ ] **Step 1: Define and export `BuiltRequest`**

Add to `send.ts`:

```ts
export interface BuiltRequest {
  method: string;
  url: string;           // absolute, post-substitution, with query applied
  headers: Record<string, string>;
  bodyText?: string;     // JSON.stringify of the body, if any
  useProxy: boolean;     // effective (per-request override vs spec default)
  missingVars: string[]; // variables referenced but not defined in active env
}
```

- [ ] **Step 2: Pull assembly out of `sendRequest`**

Create `buildRequest(req: RunRequest): BuiltRequest`. Move everything from the current `sendRequest` between "compute vars" and the `fetch(target, ...)` call into it:

```ts
export function buildRequest(req: RunRequest): BuiltRequest {
  const vars = envVars(req);
  const missing: string[] = [];
  const sub = (s: string): string => {
    const { text, missing: m } = substitute(s, vars);
    for (const x of m) if (!missing.includes(x)) missing.push(x);
    return text;
  };

  let path = req.endpoint.path;
  for (const [k, v] of Object.entries(req.inputs.path)) path = path.replaceAll(`{${k}}`, encodeURIComponent(v));
  const url = new URL(sub(req.baseUrl + path));
  for (const [k, v] of Object.entries(req.inputs.query)) if (v !== '') url.searchParams.set(k, sub(v));

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.inputs.headers)) headers[k] = sub(v);
  if (req.endpoint.requestBody) headers['content-type'] = 'application/json';

  const auth = req.endpoint.auth === 'inherit' ? req.spec.auth : req.endpoint.auth;
  const ctx = applyAuth({ headers, url }, auth);

  const useProxy =
    req.useProxy ?? (req.endpoint.useProxy === 'inherit' ? req.spec.useProxyDefault : req.endpoint.useProxy);

  const bodyText =
    req.endpoint.requestBody && req.inputs.body !== undefined
      ? JSON.stringify(substituteInValue(req.inputs.body, sub))
      : undefined;

  return {
    method: req.endpoint.method,
    url: ctx.url.toString(),
    headers: ctx.headers,
    bodyText,
    useProxy,
    missingVars: missing,
  };
}
```

- [ ] **Step 3: Have `sendRequest` consume it**

```ts
export async function sendRequest(req: RunRequest): Promise<RunResult> {
  const built = buildRequest(req);

  let target = built.url;
  if (built.useProxy) {
    const proxy = req.proxyUrl ?? 'http://localhost:4801';
    target = `${proxy}/proxy?url=${encodeURIComponent(built.url)}`;
  }

  const start = performance.now();
  try {
    const resp = await fetch(target, {
      method: built.method,
      headers: built.headers,
      body: built.bodyText,
    });
    // …rest unchanged, but return { …, missingVars: built.missingVars }
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

The observable behavior of `sendRequest` does not change. Existing runner tests must still pass.

- [ ] **Step 4: Unit tests for `buildRequest`**

`apps/web/tests/runner/buildRequest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRequest } from '../../src/runner/send';
import type { RunRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
// …

function makeReq(partial: Partial<RunRequest>): RunRequest { /* helper */ }
```

Required cases:
- Path params substituted: `/users/{id}` + `{ id: '42' }` → URL ends in `/users/42`.
- Query params appended with URL-encoding (value containing `&` and space).
- `{{var}}` substitution in baseUrl, path, query, header, and body string leaves paths intact.
- Auth presets:
  - `bearer` → `Authorization: Bearer <token>` header added.
  - `basic` → `Authorization: Basic <base64>`.
  - `apiKey { in: 'header' }` → named header set.
  - `apiKey { in: 'query' }` → query param on URL.
  - `none` → no auth header added.
- `requestBody` present → `content-type: application/json` header added; `bodyText` is `JSON.stringify(body)`.
- `requestBody` absent → `bodyText === undefined`; no content-type header.
- `useProxy` resolves: per-request override wins; else endpoint `'inherit'` reads spec default.
- `missingVars` lists every undefined `{{var}}` referenced.

Run: `pnpm --filter web test -- buildRequest`. Also run `pnpm --filter web test -- send.test` to verify no regression.

- [ ] **Step 5: Commit**

`refactor(runner): extract buildRequest from sendRequest`

---

### Task 2: `toCurl` renderer

**Files:**
- Create: `apps/web/src/runner/curl.ts`
- Create: `apps/web/tests/runner/curl.test.ts`

**Acceptance criteria covered:** spec requirements 2, 3, 5.

- [ ] **Step 1: Implement `toCurl`**

```ts
import type { BuiltRequest } from './send';

export interface CurlOptions {
  secretMask?: Record<string, string>;
  proxyOn?: boolean;
}

export function toCurl(req: BuiltRequest, opts: CurlOptions = {}): string {
  const lines: string[] = [];
  lines.push(`curl -X ${req.method} ${q(req.url)}`);
  for (const [k, v] of Object.entries(req.headers)) {
    lines.push(`-H ${q(`${k}: ${v}`)}`);
  }
  if (req.bodyText !== undefined) {
    lines.push(`--data-raw ${q(req.bodyText)}`);
  }

  let cmd = lines.join(' \\\n  ');

  if (opts.secretMask) {
    for (const [raw, placeholder] of Object.entries(opts.secretMask)) {
      if (!raw) continue;
      cmd = cmd.split(raw).join(placeholder);
    }
  }

  if (opts.proxyOn) {
    cmd = `# Proxy mode is on in the app; this cURL hits the origin directly.\n${cmd}`;
  }

  return cmd;
}

function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
```

Notes:
- `split(raw).join(placeholder)` is safer than `String.prototype.replaceAll(raw, …)` when `raw` might contain regex-ish chars — `split` takes the raw value literally.
- Continuation `\` is followed by `\n  ` (two-space indent) so the copied command is readable but still one shell invocation.
- `--data-raw` chosen over `-d` so leading `@` characters and newlines don't get special-cased.

- [ ] **Step 2: Unit tests**

`apps/web/tests/runner/curl.test.ts`:

Required cases:
- **Method explicit for GET**: output contains `-X GET`.
- **Header rendering**: each header on its own continuation line, POSIX-quoted.
- **Shell quoting — apostrophe in value**: a header value `"O'Reilly"` renders as `'O'\''Reilly'`.
- **Body**: JSON string passed through `q`; object keys preserved in order.
- **No body**: output contains no `--data-raw`.
- **Secret mask**: raw value `abc123` replaced by `$TOKEN` everywhere it appears; non-secret values pass through untouched.
- **Secret mask with multiple secrets**: two raws replaced correctly, independent of order.
- **Empty secret value skipped**: mask entry with `raw === ''` is ignored (we must not replace the empty string — `split('').join(…)` would interleave the placeholder between every character).
- **Proxy comment on/off**: `#` comment line present iff `proxyOn: true`.

Run: `pnpm --filter web test -- curl`.

- [ ] **Step 3: Commit**

`feat(runner): toCurl renderer with secret masking and POSIX quoting`

---

### Task 3: RunPanel Copy button

**Files:**
- Modify: `apps/web/src/ui/icons.tsx` (if `IconClipboard` missing)
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Create: `apps/web/tests/ui/RunPanel.curl.test.tsx`

**Acceptance criteria covered:** spec requirements 1, 4, 5, 7.

- [ ] **Step 1: Add `IconClipboard`**

Check `icons.tsx`. If not present, add a 14×14 outline clipboard glyph following the pattern of the other icons. (Same stroke width, same `currentColor`.)

- [ ] **Step 2: Build the secret mask**

New helper inside `RunPanel.tsx`:

```ts
function secretMaskFor(spec: Spec, secrets: Record<string, string>): Record<string, string> {
  const env = spec.environments[spec.activeEnvironment];
  if (!env) return {};
  const out: Record<string, string> = {};
  for (const v of env.variables) {
    if (!v.secret) continue;
    const raw = secrets[v.name] ?? v.value;
    if (raw) out[raw] = '$' + v.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }
  return out;
}
```

Normalize names to an all-caps shell-safe identifier so the placeholder is a valid bash variable.

- [ ] **Step 3: Copy handler**

```ts
import { buildRequest } from '../runner/send';
import { toCurl } from '../runner/curl';

const [copied, setCopied] = useState(false);
const [curlFallback, setCurlFallback] = useState<string | null>(null);

async function onCopyCurl() {
  const missingVars = collectMissingVars();
  if (missingVars.length > 0) {
    const go = confirm(
      `Undefined variable(s): ${missingVars.join(', ')}\n\nCopy anyway? The command will contain literal '{{name}}'.`,
    );
    if (!go) return;
  }

  const secretStore = await loadSecrets();
  const secrets = secretStore[spec.activeEnvironment] ?? {};

  let body: unknown = undefined;
  if (endpoint!.requestBody) {
    try { body = JSON.parse(bodyText); }
    catch {
      setCurlFallback(null);
      alert('Request body is not valid JSON — fix it before copying.');
      return;
    }
  }

  const built = buildRequest({
    spec, endpoint: endpoint!, baseUrl,
    inputs: { path: pathVals, query: queryVals, headers: headerVals, body },
    secrets,
    useProxy,
  });

  const cmd = toCurl(built, {
    secretMask: secretMaskFor(spec, secrets),
    proxyOn: built.useProxy,
  });

  try {
    await navigator.clipboard.writeText(cmd);
    setCurlFallback(null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  } catch {
    setCurlFallback(cmd);
  }
}
```

- [ ] **Step 4: Button + fallback in JSX**

Next to the Send button:

```tsx
<button
  className="btn"
  onClick={() => void onCopyCurl()}
  title={t('copyAsCurl')}
>
  <IconClipboard />
  {copied ? t('copied') : t('copyAsCurl')}
</button>
```

Below the button row, conditionally render the fallback:

```tsx
{curlFallback && (
  <div role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
    <div className="mb-1">Copy failed — select the command below and press {navigator.platform.includes('Mac') ? '⌘C' : 'Ctrl+C'}.</div>
    <textarea
      readOnly
      autoFocus
      className="input w-full font-mono text-[11px]"
      rows={Math.min(8, curlFallback.split('\n').length)}
      value={curlFallback}
      onFocus={(e) => e.currentTarget.select()}
    />
  </div>
)}
```

Add `copied` to both locale files (en: `"copied": "Copied"`, zh-TW: `"copied": "已複製"`). The `copyAsCurl` key already exists in both — verify via grep.

- [ ] **Step 5: Component tests**

`apps/web/tests/ui/RunPanel.curl.test.tsx`:

Use existing `RunPanel` test-setup style (seed the store, select an endpoint). Required cases:

1. **Happy path — secret masked**: seed env with secret `TOKEN=abc123`, endpoint with bearer-auth using `{{TOKEN}}`. Click Copy. Assert:
   - `navigator.clipboard.writeText` called once.
   - Argument contains `$TOKEN` and does **not** contain `abc123`.
   - Button text flips to `Copied`, then back after the timeout.
2. **Plain-text non-secrets**: env var `ENV=prod` (not secret) referenced in baseUrl. Click Copy. Argument contains the literal `prod`, no `$ENV`.
3. **Fallback on clipboard rejection**: stub `navigator.clipboard.writeText` to reject. Click Copy. Assert `<textarea role="alert">` (or the value-containing textarea) is rendered with the cURL command.
4. **Missing-var warning**: reference `{{foo}}` that is not defined. Stub `window.confirm` to return `false`. Click Copy. Assert clipboard is NOT called.
5. **No body endpoint**: GET endpoint with no requestBody. Assert the command has no `--data-raw`.

Clipboard and confirm stubs via `vi.stubGlobal` + `vi.fn()`. Restore in `afterEach`.

- [ ] **Step 6: Commit**

`feat(web): copy as cURL button in Try-it panel`

---

### Task 4: Full-suite verification + UX pass + docs move

**Files:** none.

- [ ] **Step 1**: `pnpm --filter web test` — green.
- [ ] **Step 2**: `pnpm --filter web test:e2e` (check script name in package.json) — green.
- [ ] **Step 3: Manual UX pass**

`pnpm dev`, then:

1. Create an endpoint with a bearer auth using a secret env var `TOKEN`. Fill some path/query/body values. Click Copy. Paste into a terminal — replace `$TOKEN` with a real token and run. Compare the response with the in-app Send result — they should be equivalent.
2. Click Copy with no values. Inspect the command — it should be well-formed cURL, no trailing backslash, method explicit.
3. Turn on proxy mode. Click Copy. Confirm the first line is a `#` comment about proxy mode and the URL is the origin, not the local proxy.
4. Override a header value to contain `'` (single quote). Click Copy. Paste into a terminal. Confirm the command executes (POSIX escape works).
5. Trigger the fallback: open DevTools, run `navigator.clipboard.writeText = () => Promise.reject('nope');` then click Copy. Confirm the textarea appears with the command and auto-selects.

- [ ] **Step 4: Move docs**

On merge:
- Move `docs/specs/active/2026-04-18-copy-as-curl.md` → `docs/specs/done/`.
- Move `docs/plans/active/2026-04-18-copy-as-curl.md` → `docs/plans/done/`.
- Commit: `docs: mark copy-as-cURL done`.

---

## Open Questions
None at plan time. If the shell-variable placeholder format causes friction for Windows-cmd users, revisit with a platform toggle — deferred.
