# gen-spec — Typed API Spec + Runtime Tester (MVP)

## Problem
Postman tests APIs well but doesn't enforce types. Swagger/OpenAPI documents types but can't build them in a UI or validate live responses against them. gen-spec combines both: a browser app where users construct typed API specs via a UI (not raw schema text), send real requests, and automatically validate responses against the declared types — like Postman + Swagger + Zod in one tool. The spec is a plain file committed to git, so teams share and diff specs the same way they share code, without a hosted service.

## Acceptance Criteria
Each criterion becomes a test case during implementation.

### Type builder
- [ ] User can construct a type using a UI (dropdowns, inputs, nested fields) with no need to write raw JSON Schema or Zod code
- [ ] Type builder supports: `string`, `number`, `integer`, `boolean`, `null`, `object` (nested, arbitrarily deep), `array`, `union` (oneOf), `literal`, and reference to a named type
- [ ] Each field has `required` / `optional` toggle and an optional description
- [ ] String fields support `minLength`, `maxLength`, `pattern` (regex), and `enum` constraints
- [ ] Number/integer fields support `min`, `max`, and `enum` constraints
- [ ] Array fields support `minItems`, `maxItems`, and an element type
- [ ] Named (reusable) types appear in a "Types" panel and can be referenced from any request's body or response type
- [ ] Renaming a named type updates all references within the spec

### Endpoint editor
- [ ] User can define an endpoint with: HTTP method (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS), path template (with `{param}` segments — OpenAPI-style), description
- [ ] User can declare typed path params, query params, and headers (each with name, type, required flag, description)
- [ ] User can declare a JSON request body type
- [ ] User can declare multiple response types keyed by HTTP status code (e.g., 200 → `User`, 400 → `Error`, 401 → `Unauthorized`); validation runs only when a type is declared for the returned status

### Request runner
- [ ] User can click "Send" on an endpoint to execute an HTTP request using the current values
- [ ] The runner substitutes environment variables using `{{name}}` syntax in URL, headers, and body
- [ ] The runner shows: status code, latency, response headers, response body (pretty JSON), and whether the response validated against the declared type for that status
- [ ] On type mismatch, failures are shown inline on the response body with per-field paths and messages (e.g., `user.age: expected number, got string`) using a squiggly-underline + hover-hint treatment
- [ ] Proxy routing has a spec-level default (direct fetch) and a per-request override checkbox; when proxy is on, the request routes through a local proxy so the user can set cookies and other browser-forbidden headers
- [ ] When the user enables proxy mode but the proxy is unreachable, the app shows a clear actionable error ("Start the proxy with `npx gen-spec-proxy`")

### Environments & auth
- [ ] User can define multiple environments (e.g., `dev`, `staging`, `prod`), each a set of key/value variables
- [ ] User can switch the active environment from a single control; all requests resolve variables against it
- [ ] Auth presets supported: `None`, `Bearer` (token), `Basic` (username/password), `API Key` (header or query, name + value)
- [ ] Auth can be set at the spec level (default for all endpoints) and overridden per endpoint
- [ ] Secret values (tokens, passwords) can be referenced via `{{env_var}}` and are never written into the spec file

### Storage & sharing
- [ ] User can open a spec file from disk (File System Access API on supported browsers; file picker upload as fallback)
- [ ] User can save back to the same file handle (supported browsers) or download the spec as a file (fallback)
- [ ] Unsaved edits persist across page reload via IndexedDB so a refresh doesn't lose work
- [ ] A "discard draft" control clears the IndexedDB draft and reloads from the source file
- [ ] The spec file is plain JSON with a stable shape so it diffs cleanly in git

### Export
- [ ] User can export the spec as OpenAPI 3.1 (JSON or YAML)
- [ ] User can export the spec as a JSON Schema bundle (types under `$defs`)
- [ ] User can export the spec as Markdown human-readable documentation (one section per endpoint: description, method+path, tables for params/headers, request/response shapes, example payloads)
- [ ] Every export operation also emits the canonical custom JSON file alongside the export, so another instance of the app can reopen the spec losslessly. The export formats are derivative views; the canonical JSON is the only lossless artifact.
- [ ] The UI makes this explicit — for example, an "Export" action produces a folder (or zip) containing both the canonical `.gen-spec.json` and the chosen export file(s), never just the export alone

## Non-goals
- **Not a hosted/multi-user service.** No login, no cloud storage, no team sync. Git is the collaboration layer.
- **Not a general HTTP client.** REST/JSON only in MVP. No GraphQL, no WebSocket, no gRPC.
- **Not a replacement for test frameworks.** No assertions beyond type validation, no pre/post scripts, no test orchestration, no chaining response→request values in MVP.
- **No non-JSON bodies in MVP.** No `multipart/form-data`, no `application/x-www-form-urlencoded`, no binary uploads.
- **No batch "Run all" in MVP.** One request at a time; batch runner is a future feature.
- **No Postman/Insomnia import.** Deferred.
- **No format presets** (`email`, `uuid`, `datetime`, `url`). Users can enforce via `pattern` if needed.
- **No pre-request scripts or dynamic auth flows** (OAuth code grant, token refresh). User fetches tokens manually and pastes into env vars.
- **No mocking/stubbing.** The app always hits a real server.

## Requirements

### Functional
- The spec file is the source of truth. Everything the user configures (types, endpoints, environments, auth) lives in one JSON file.
- The canonical custom JSON is the only format the app reads back in. OpenAPI / JSON Schema / Markdown exports are one-way and lossy; the app cannot reconstruct a full spec from them alone.
- Environment **values** are stored inside the spec (so dev/staging configs travel with the spec), but a mechanism must exist to mark individual values as **secret** so users can opt out of committing them (secrets stored only in IndexedDB, not written to the file on save).
- The type system is the app's own shape (informed by JSON Schema and Zod), optimized for the builder UI. OpenAPI/JSON Schema are export targets, not the internal representation.
- Response validation runs automatically after every request; results display alongside the response body.
- Variable substitution `{{name}}` works in: URL (base and path), query values, header values, and request body strings.

### Edge cases
- **Missing response type for a returned status**: show a warning ("no type declared for status 418"), treat as neither pass nor fail.
- **Variable referenced but not defined in active environment**: substitution leaves the literal `{{name}}` in place and a warning is surfaced before sending; the user confirms or cancels.
- **Reference to deleted named type**: editor shows the reference as broken and prevents save until resolved or the reference is removed.
- **Circular type references** (e.g., `TreeNode` containing an array of `TreeNode`): allowed; validator must handle cycles without stack overflow.
- **Unknown fields in response** (response has fields not in the declared type): pass by default (tolerant validation); a per-type "strict" toggle flips this to fail on unknown fields.
- **Network error / CORS failure**: classify and show — network error vs CORS vs timeout vs non-2xx — with actionable hint for CORS (enable on server, use proxy).
- **Spec file from a newer schema version**: app refuses to open and shows the version mismatch; no silent data loss.
- **Opening a spec where secrets were stripped**: app highlights each missing secret in the environment panel and blocks sending requests that depend on them until the user fills them in.
- **Browser without File System Access API** (Safari, Firefox): fall back to upload/download; IndexedDB draft still works; users see which mode they're in.

### Constraints
- Runs fully client-side; no backend required for the app itself.
- Proxy (separate package) is the only optional server component; it is stateless and runs locally.
- All spec data fits in a single human-readable JSON file that is practical to diff in a PR review.

## Decisions

| Decision | Chosen | Why | Rejected alternatives |
|----------|--------|-----|-----------------------|
| Form factor | Web app (browser SPA) | No install, easy to share, can later be wrapped as a desktop app | Desktop app (install friction), VS Code extension (too narrow), CLI + local server (extra setup) |
| Spec format (internal) | Custom JSON, app's own shape | Tighter fit with Zod-style precision and the builder UI than OpenAPI's looser model | Native OpenAPI (looser types), native JSON Schema (awkward for the UI) |
| Export targets | OpenAPI 3.1 + JSON Schema + Markdown | OpenAPI for interop, JSON Schema for validators, Markdown for humans | OpenAPI only (no human docs), proprietary only (no interop) |
| Export always bundles canonical JSON | Yes — every export also emits the `.gen-spec.json` file | Exports are lossy; without the canonical JSON the user cannot reopen the spec in the app on another machine | Export-only (user loses the spec if they share only OpenAPI/MD), embed canonical JSON inside OpenAPI as extensions (fragile, breaks validators) |
| Protocol scope (MVP) | REST/JSON only | Covers target use cases; keeps scope tight | REST + GraphQL + WebSocket (scope creep for MVP) |
| Type system scope | Basics + constraints + unions + named refs + literals | Enough expressiveness for real APIs without a giant UI | Basics only (can't describe real APIs), with format presets (overreach — users can regex) |
| Storage | Direct file handle (supported browsers) + upload/download fallback + IndexedDB draft cache | Git is the sharing layer; file is truth; IndexedDB prevents lost edits across reload | IndexedDB-only (no git sharing), download-only (every save is a download) |
| CORS strategy | Direct fetch by default, optional local proxy toggled per request | Direct works for dev APIs (majority); proxy unlocks cookies and forbidden headers when needed | Always-proxy (setup friction), document-only (cookies impossible) |
| Proxy delivery | Small standalone npm package (e.g., `npx gen-spec-proxy`) | Stateless, trivial to audit, no install required | Bundled browser extension (distribution burden), desktop app only |
| Auth model | Env variables + first-class auth presets (None/Bearer/Basic/API Key) | Covers ~95% of real APIs with no scripting surface | Env-only (clunky for Basic/API Key), scripting-enabled (sandbox & security surface) |
| Environment variables | Postman-style `{{name}}` substitution in URL/headers/body | Familiar to users coming from Postman; simple to implement and read | Templating language (overkill), no variables (unusable across envs) |
| Secret handling | Env values can be marked secret; secrets stored only in IndexedDB, never in spec file | Lets spec commit to git safely without leaking tokens | All-in-file (leaks), separate .env.local convention (UX friction) |
| Response validation | Strict by default — mismatch fails the test; tolerant of unknown fields unless a per-type strict flag is set | If a type is declared, a mismatch is a real bug; unknown-field strictness is usually too noisy | Warning-only (defeats the point), always strict (noisy) |
| Error display | Inline squiggly-underline + hover hint on the response body, plus a summary list | Reads like an editor; points the user directly at the offending path | Modal dialog (interrupts flow), summary-list-only (hunt for the field) |
| Response types | Multiple types keyed by HTTP status code per endpoint | Real APIs return different shapes by status; matches OpenAPI's model | Single response type (can't cover error shapes) |
| Request body content type (MVP) | `application/json` only | Covers the vast majority of modern APIs | multipart/form-urlencoded (deferred), all-of-the-above (scope bloat) |
| Batch "Run all" | Deferred | Single-request flow delivers core value first | Include in MVP (scope creep) |

## Dependencies
- **Reads from:** nothing external; all state is in the spec file plus IndexedDB draft cache
- **Used by:** N/A (this IS the app)
- **External runtime dependencies:** optional local proxy (separate package, same repo) for CORS/cookies
- **Rules:** none yet — `docs/rules/` is empty. Rules may be added during the plan/build phase as patterns emerge (e.g., spec file versioning, validator cycle detection).

## Open Questions
(none — ready for planning)
