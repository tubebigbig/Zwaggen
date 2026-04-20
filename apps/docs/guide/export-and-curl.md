---
description: Export a request as a cURL command, OpenAPI fragment, or typed TypeScript snippet.
---

# Export & Copy as cURL

Two ways to move a request or a whole spec out of Zwaggen.

## Export the spec

- **Spec Info → Export**.
- Three formats:
  - **Zwaggen (`.zwaggen.json`)** — canonical, round-trippable. Use this for git versioning.
  - **OpenAPI 3.1 (JSON)** — best-effort conversion; the same caveats as [OpenAPI Import](/guide/openapi-import) apply in reverse.
  - **OpenAPI 3.1 (YAML)** — same as JSON, reformatted.

The canonical Zwaggen format is the source of truth. OpenAPI export is for interop only — re-importing it may drop fields that don't have an OpenAPI equivalent.

### Folders and extends in OpenAPI output

- **Types in folders** export with a flattened schema key (e.g. `auth/User` → `components.schemas.auth_User`) plus an `x-folder: "auth"` vendor extension so Zwaggen can recover the path on re-import. See [Folders](/guide/folders).
- **Types with extends** export as an `allOf` with one `$ref` per parent, plus a single inline object member carrying the child's own fields (omitted if the child adds nothing). Tooling that understands `allOf` (Swagger UI, Redoc, most codegens) renders these correctly. See [Type Inheritance](/guide/type-inheritance).
- **Endpoints in folders** carry `x-folder` on the operation.

Third-party tools that don't recognize `x-folder` will treat the flattened schema keys and operation annotations as opaque — no rendering issue, just no folder grouping in their UI.

## Copy as cURL

![Copy as cURL button in the Run panel after a successful send, showing Copied confirmation](/screenshots/copy-as-curl.png)

From the Run panel:

- After a run, click **Copy as cURL** above the Response body.
- The clipboard gets a one-liner suitable for paste into any shell.

From the endpoint list:

- Right-click an endpoint → **Copy as cURL**. This uses the current values in the Run panel (URL, headers, body).

### What gets resolved

- Environment variables (`{{env.foo}}`) — resolved to the active environment's values. Captured tokens also live in env vars, so they're baked in too.
- Auth preset — baked in as the appropriate header (`Authorization: Bearer …`, basic auth, or API key header/query).

### A security note

The cURL includes every real value — tokens, passwords, API keys. Treat it like a credential:

- Don't paste into a public issue or Slack channel.
- Don't commit to git.
- Rotate the credential if the cURL leaked.

### Typical use

- **Reproduce in a shell.** Run the same request outside the browser.
- **Share with a teammate**, after scrubbing secrets.
- **Drop into a CI script** as a one-off smoke test. (For fleet testing, wait for the CI-mode CLI — tracked in the repo TODO.)
