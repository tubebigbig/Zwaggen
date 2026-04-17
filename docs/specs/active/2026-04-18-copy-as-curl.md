# Copy as cURL — snapshot the resolved request

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — `RunPanel` + new `runner/curl.ts`

## Problem

Right now the only way to share "the exact request I just sent" is to screenshot the RunPanel or read the DevTools network tab. Both are lossy. Users coming from Postman expect a **Copy as cURL** button that produces a command they can paste into a terminal, a bug report, or a colleague's chat — and trust that it's the same request the app executed.

A cURL button is also the cheapest doctor for CORS / auth / proxy issues: drop the command in a terminal, compare its outcome to the app's, and you immediately know whether the failure is browser-side or server-side.

## Goal

A single "Copy as cURL" button in the Try-it panel that, when clicked, copies a cURL command to the clipboard that reproduces the *currently-resolved* request: method, URL (post env-substitution), headers (including the auth preset's header or query injection), and JSON body. Secret variables are *not* inlined — they are left as shell variables so the snippet is safe to paste into a chat or issue tracker.

## Non-goals

- **Not fetch / axios / httpie output.** Those are valuable but deferred — adding them later is a dropdown next to the same button.
- **Not a full HAR export.** This is a one-request-at-a-time convenience. Batch or history export is a different feature.
- **Not an "export cURL from endpoint definition" button separate from Try-it.** The command reflects the Try-it form, which is where the user has typed real values. A spec-level "command template" is not useful — users who want that can copy the path and fill it in.
- **Not a GUI for toggling flags** (`--insecure`, `--http2`, etc.). Out of scope for MVP.
- **Not proxy-aware.** Even when the app is in proxy mode, the copied command targets the origin URL directly — the snippet shouldn't depend on the local proxy running. A short header comment notes this when proxy mode is on.

## Requirements

1. **Button placement**: the "Copy as cURL" button sits next to the existing Send button in the Try-it panel. It uses the existing `copyAsCurl` i18n key and a clipboard icon from the existing icon set (add `IconClipboard` if missing).
2. **Command content**:
   - Method: always explicit via `-X METHOD`, even for GET (round-trip-safe).
   - URL: the fully resolved URL — `baseUrl + path` with path params substituted, env variables substituted, query params appended, API-key-in-query injected when the auth preset is `apiKey { in: 'query' }`.
   - Headers: one `-H 'name: value'` per header. Includes user-declared headers *and* the auth-preset-derived header (Authorization for bearer/basic, or the API-key header).
   - Body: when the endpoint declares a `requestBody`, include `--data-raw '<json>'`. Use `--data-raw` (not `-d`) so cURL doesn't try to interpret `@` or strip newlines.
   - Shell quoting: single-quote each value; embedded single quotes are rendered via the POSIX `'\''` trick.
3. **Secret masking**: any value that came from a secret env variable (marked `v.secret === true`) renders as `"$VAR_NAME"` inside its containing header/URL value. Non-secret variables are inlined literally. Missing variables leave the literal `{{name}}` in place and surface the same warning the Send button shows.
4. **Clipboard + feedback**: click writes to `navigator.clipboard.writeText`, then flips the button label to `t('copied')` for 1.5 s, then reverts. On clipboard failure, show a small `role="alert"` with a short "Copied failed — use Ctrl+C on the textarea" hint and drop the command into a `<textarea>` that auto-selects for manual copy.
5. **Proxy-mode comment**: when the effective `useProxy` would be true for this request, prepend the command with a `# Proxy mode is on in the app; this cURL hits the origin directly.` comment line.
6. **Pure building function**: the cURL string must be produced by a pure function `toCurl(input)` in a new module, with no DOM or clipboard access — the UI calls it and then handles the clipboard separately. The function is fully unit-testable.
7. **No spec mutation**: clicking Copy must not change any store state, draft, or spec.

## Design

### New module — `apps/web/src/runner/curl.ts`

```ts
export interface CurlInput {
  method: string;
  url: string;                // already substituted, query already applied
  headers: Record<string, string>;
  body?: string;              // JSON-stringified body, if any
  secretMask?: Record<string, string>;
  // e.g. { 'ghp_abcdef…': '$GITHUB_TOKEN' } — post-build, any occurrence of
  // the raw secret value in the serialized command gets replaced by the name.
  proxyOn?: boolean;
}

export function toCurl(input: CurlInput): string;
```

Algorithm:
1. Build the command piece by piece using single-quoted values.
2. After the whole string is assembled, apply `secretMask`: for each `[raw, placeholder]`, replace literal occurrences of `raw` in the command with the placeholder. Do this on the assembled command, not the individual parts, so the mask catches secrets that appear both in URL (API-key-in-query) and headers (Authorization).
3. If `proxyOn`, prepend `# Proxy mode is on in the app; this cURL hits the origin directly.\n`.

Shell quoting helper:
```ts
function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
```

This is the standard POSIX-safe escape and handles every real-world value including JSON payloads with embedded apostrophes.

Example output for POST /users with a bearer-token auth, one JSON field, and `token` a secret:

```
# Proxy mode is on in the app; this cURL hits the origin directly.
curl -X POST 'https://api.example.com/users' \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer $API_TOKEN' \
  --data-raw '{"name":"Alice"}'
```

### Runner integration — `apps/web/src/runner/send.ts`

Extract the request-building into a small helper (or duplicate the logic in the UI — see "Trade-off" below). The cleanest path is a **new helper** that both the UI and `sendRequest` use:

```ts
export interface BuiltRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
  useProxy: boolean;
  missingVars: string[];
}

export function buildRequest(req: RunRequest): BuiltRequest;
```

`sendRequest` then becomes "call `buildRequest`, then fetch." The UI's cURL button calls `buildRequest`, then `toCurl`. This keeps one source of truth for URL/header/body construction — drift between the copied command and the actually-sent request is the scariest bug this feature could introduce.

### UI — `apps/web/src/ui/RunPanel.tsx`

Add a Copy button next to Send:

```tsx
<button
  className="btn"
  onClick={() => void onCopyCurl()}
  disabled={copying}
>
  <IconClipboard />
  {copied ? t('copied') : t('copyAsCurl')}
</button>
```

`onCopyCurl`:
1. Assemble secret mask from the active environment: `{ [rawValue]: `$${name.toUpperCase()}` }` for each `v.secret` with a non-empty value.
2. Call `buildRequest({...})` with the same inputs the Send path uses.
3. Run the `missingVars` warning dialog if any, same as Send.
4. Call `toCurl(...)`.
5. `await navigator.clipboard.writeText(cmd)`; set `copied = true` for 1.5 s.
6. On clipboard rejection, fall back to a small `<textarea readOnly>` appearing below the buttons with the command pre-selected. The user can `Ctrl+C` from there. No further retry.

State:
```ts
const [copied, setCopied] = useState(false);
const [curlFallback, setCurlFallback] = useState<string | null>(null);
```

`copied` auto-resets via `setTimeout`. `curlFallback` clears when the user clicks Copy again successfully, or when the dialog dismisses.

## Architecture & data flow

```
RunPanel  ──► buildRequest(spec, endpoint, inputs, secrets)  ──► BuiltRequest
                                                                    │
                                       same function used by sendRequest
                                                                    │
                                           toCurl(BuiltRequest)  ──► string
                                                                    │
                                         navigator.clipboard.writeText(...)
```

One build function, two consumers. No drift.

## Testing

### Unit — `apps/web/tests/runner/curl.test.ts` (new)

- **Method** always explicit, even for GET.
- **Header order**: headers rendered in insertion order (deterministic for snapshot).
- **JSON body**: command contains `--data-raw '{"…"}'` exactly; object keys preserved.
- **Shell quoting**: a header value with a literal `'` renders as `'\''`.
- **Secret mask**: bearer token value replaced by `$API_TOKEN`; API-key-in-query value replaced by `$API_KEY` in both URL and header positions.
- **Proxy comment**: present when `proxyOn: true`, absent when false.
- **No body endpoint**: command omits `--data-raw`.

### Unit — `apps/web/tests/runner/buildRequest.test.ts` (new)

- Path-param substitution (`/users/{id}` + `{ id: '42' }` → `/users/42`).
- Query params applied, including values with `&` and spaces (URL-encoded).
- Env-variable substitution in URL, headers, and JSON body leaves paths intact.
- Auth presets produce the right header / query (bearer → `Authorization: Bearer …`, apiKey header vs query).
- Missing variables bubble out via `missingVars` array.

### Component — `apps/web/tests/ui/RunPanel.curl.test.tsx` (new)

- Seed a store with an endpoint + a secret env var `TOKEN=abc123`.
- Click Copy. Assert `navigator.clipboard.writeText` called once with a command that contains `$TOKEN` and does *not* contain `abc123`.
- Assert the button label briefly shows `Copied`, then reverts.
- Force clipboard rejection (monkeypatch `navigator.clipboard.writeText` to throw). Assert the fallback `<textarea>` appears with the command.
- Missing variable dialog: seed with an undefined `{{foo}}` reference, stub `window.confirm` to return `false`, assert clipboard is NOT called.

## Error handling

- **Clipboard API unavailable / rejected**: fallback textarea. No toast, no retry.
- **Missing vars**: reuse the existing `confirm` dialog the Send button shows.
- **No endpoint selected**: button is hidden (same guard as Send).

No new error classifications enter `classify-error.ts`; the copy path doesn't touch the network.

## Open questions

1. Should the button be disabled while a Send is in flight? **Decision**: no — cURL generation is instant and independent; letting the user copy while Send is running is strictly better.
2. Should non-secret env vars *also* render as `$VAR` for portability? **Decision**: no. The explicit principle is "inline everything the user can paste into a terminal safely; mask only what's secret." This matches Postman's default.
