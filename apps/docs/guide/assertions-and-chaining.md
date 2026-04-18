# Assertions & Response Chaining

Two features that share a tab in the editor: **Assertions** check a response meets your expectations, **Chaining** captures values for the next request.

![Assertions and Captures sections on an endpoint, with expected status, max latency, a required header, and a body capture row](/screenshots/assertions-tab.png)

## Assertions

Open an endpoint, click the **Assertions** tab. You can declare:

- **Expected status** — a single numeric status (e.g. `200`). If the server returns anything else, the run is marked failed even if the body validates.
- **Max latency** — milliseconds. Run fails if first byte takes longer.
- **Required headers** — name/value pairs the response must carry. The check is exact match on value.

A run passes only if:

1. the body validates against the response type for the returned status (see [Running Requests](/guide/running-requests)), AND
2. every assertion passes.

Failing assertions are listed in the Response tab under a red "Assertions failed" header.

### What assertions are not

- Not arbitrary JavaScript — no Postman-style `pm.test(…)` scripting. If you need free-form checks, consider the [CI-mode CLI](https://github.com/tubebigbig/Zwaggen) (planned in the repo TODO).
- Not a full contract suite — they're sanity checks layered on top of the real validator, which is type-driven.

## Response chaining

Use case: you log in, the response returns a token, you want the next request to send that token automatically.

### Capture

On the endpoint that produces the value, open **Assertions & Chaining → Captures**. Add a row:

- **Name** — the chain key (e.g. `authToken`).
- **Source** — `body`, `header`, or `status`.
- **Path** — for `body`, a dotted JSON path (`data.token`). For `header`, the header name.

On the next successful run, Zwaggen stores the captured value under that name in the session's chain map.

### Reference

In any request — path, headers, or body — use `{{chain.authToken}}`. The placeholder resolves at send time; if the chain name is empty (no capture has run yet), the run errors before sending, with a "chain value not set" message.

### Typical flow

1. Define a `POST /auth/login` endpoint with a capture: `name: authToken`, `source: body`, `path: token`.
2. Define a `GET /me` endpoint whose headers include `Authorization: Bearer {{chain.authToken}}`.
3. Run `POST /auth/login`. See the capture populate in the History drawer.
4. Run `GET /me`. The Authorization header is populated from the chain.

### Clearing chain values

Captures live in memory for the session. Close the tab → they're gone. To clear mid-session, open the History drawer and use **Clear chain values**.
