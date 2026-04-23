---
description: Execute a spec endpoint against the live server and see the typed response validated in real time.
---

# Running Requests

Select an endpoint and the Run panel appears on the right. This page covers the Run panel itself; see [Assertions & Chaining](/guide/assertions-and-chaining) for the adjacent Assertions tab.

## Request tab

![Run panel request inputs — headers and JSON body for a POST endpoint](/screenshots/run-panel-request.png)

- **Method + URL preview** at the top: the method badge and the fully-expanded URL (base URL + path, with `{{env.*}}` placeholders resolved for the active environment).
- **Path params** — one row per path segment starting with `:`. Type values; they're substituted into the URL preview live.
- **Query params** — appended as `?key=value`. Each can be toggled on/off without deletion.
- **Headers** — editable list. Environment auth headers are shown greyed (derived, not editable here).
- **Body** — shown only for methods with a body, and the editor adapts to the endpoint's [body type](/guide/endpoints#request-body):
  - **JSON**: textarea pre-filled from the body type's `example` (see [Type Builder](/guide/type-builder)). JSON is validated on the fly.
  - **URL-encoded** / **Multipart**: key/value rows (one per declared form field). No JSON typing — fill the values directly. The runner serializes via `URLSearchParams` or `FormData` and sets the right `Content-Type` automatically.

### Placeholders

- `{{env.foo}}` — replaced by the `foo` variable from the active environment. Useful for API keys, tenant IDs, and values written by a [capture](/guide/assertions-and-chaining#capture) (captures write into env vars).

Placeholders are resolved just before sending; the URL preview shows their resolved form.

## Sending

Click **Send**. The active environment's auth preset is applied, the request fires, and the Response tab opens automatically.

## Response tab

![Run panel response — green 200, type ok, validated body](/screenshots/run-panel-response.png)

- **Status badge** — colored by class (2xx green, 4xx amber, 5xx red).
- **Latency** — milliseconds from send to first byte.
- **Validation badge** — green "Validates" or red "Invalid" with a count of mismatched fields. Click to jump to the first mismatch.
- **Body** — pretty-printed JSON by default; toggle to raw or `text/*` rendering if the Content-Type isn't JSON.
- **Headers** — full response header list.
- **Copy as cURL** — a one-liner for the exact request you just ran (see [Export & cURL](/guide/export-and-curl)).

## The CORS proxy toggle

Modern browsers block responses that don't send permissive CORS headers. If your API isn't CORS-open, flip the **Use proxy** toggle (top of the Run panel) and point it at a running `zwaggen-proxy` (default `http://localhost:8787`). See [CORS Proxy](/guide/cors-proxy).

## Every run is recorded

Each successful send lands in [History](/guide/batch-and-history). You can re-open an old run, inspect what you sent + got, and re-send the same request.
