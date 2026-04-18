# Export & Copy as cURL

Two ways to move a request or a whole spec out of Zwaggen.

## Export the spec

- **Spec Info → Export**.
- Three formats:
  - **Zwaggen (`.zwaggen.json`)** — canonical, round-trippable. Use this for git versioning.
  - **OpenAPI 3.1 (JSON)** — best-effort conversion; the same caveats as [OpenAPI Import](/guide/openapi-import) apply in reverse.
  - **OpenAPI 3.1 (YAML)** — same as JSON, reformatted.

The canonical Zwaggen format is the source of truth. OpenAPI export is for interop only — re-importing it may drop fields that don't have an OpenAPI equivalent.

## Copy as cURL

From the Run panel:

- After a run, click **Copy as cURL** above the Response body.
- The clipboard gets a one-liner suitable for paste into any shell.

From the endpoint list:

- Right-click an endpoint → **Copy as cURL**. This uses the current values in the Run panel (URL, headers, body).

### What gets resolved

- Environment variables (`{{env.foo}}`) — resolved to the active environment's values.
- Chain values (`{{chain.bar}}`) — resolved to whatever was last captured.
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
