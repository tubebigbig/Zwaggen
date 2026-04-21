# Spec — Preserve `x-*` extensions on OpenAPI round-trip (Endpoint-level v1)

## Problem

`apps/web/src/importers/openapi.ts` (`fromOpenApi`) silently drops all `x-*` keys except `x-folder` (which already has semantic meaning: folder assignment). That means a round-trip — **Import OpenAPI → edit in Zwaggen → Export OpenAPI** — erases `x-codeSamples`, `x-internal`, `x-tagGroups`, `x-logo`, and every other vendor extension. For users who rely on downstream tooling (Redocly, Speakeasy, internal doc generators), this is silent data loss on every save.

The TODO item reads: "Preserve `x-*` extensions in OpenAPI importer".

## Success criteria

- Importing an OpenAPI operation that has `x-codeSamples`, `x-internal`, or any other `x-*` key stores those extensions on the resulting `Endpoint`.
- Exporting an `Endpoint` that has captured extensions writes them back onto the OpenAPI operation object at the top level (next to `summary`, `parameters`, etc.).
- Round-trip (import → export → import) produces identical extensions.
- `x-folder` continues to be consumed semantically (moved to `endpoint.folder`) and is NOT duplicated into `endpoint.extensions`.
- SchemaVersion is bumped from 3 to 4. A v3 spec (without `extensions`) loads cleanly under v4 — missing `extensions` means "no extensions", identical to new v4 specs with no extensions.
- `docs/rules/spec-versioning.md` is updated with a v3 → v4 entry.
- Old (v3) readers receiving a v4 file refuse to load per the existing `SpecVersionError` contract — **this is intentional and already enforced**, no new work needed.

## Out of scope

- Info-level extensions (`x-logo`, etc. on `spec.info`). Deferred to follow-up; most user-visible extensions are on operations.
- Schema-level extensions (on `components.schemas[*]` / type definitions). Deferred.
- Parameter / response / property-level extensions. Deferred.
- Custom UI for viewing or editing `endpoint.extensions` in the Zwaggen app. The fields pass through invisibly for v1.
- Validation of extension value shape — the TypeScript type is `Record<string, unknown>` and everything else is the caller's responsibility.

## Approach

**Schema:**
- Freeze current `Spec` / `Endpoint` shape in `packages/core/src/schema/versions/v3.ts` (copy of current types before the `extensions` field is added).
- Bump `CURRENT_SCHEMA_VERSION` from 3 → 4 in `packages/core/src/schema/types.ts`.
- Add `extensions?: Record<string, unknown>` to the `Endpoint` interface.
- Append a v3 → v4 entry to `MIGRATIONS` in `packages/core/src/schema/migrations.ts`. The migration is a pure version-stamp — v3 endpoints have no `extensions` field, and its absence in v4 means "no extensions", so no data transformation is needed.

**Importer (`apps/web/src/importers/openapi.ts`):**
- In `readOperation`, after existing `x-folder` handling, iterate keys on the operation object that start with `x-` and are NOT `x-folder`. Copy them to `endpoint.extensions` (a new `Record<string, unknown>`). If none match, leave `extensions` undefined (don't serialize empty records — canonical serialization should not produce noise).

**Exporter (`packages/core/src/exporters/openapi.ts`):**
- In the endpoint-building loop, after assembling `op`, spread `e.extensions` onto it (`Object.assign(op, e.extensions ?? {})`). This preserves insertion order: Zwaggen-known keys first, extensions after.

**Docs:**
- `docs/rules/spec-versioning.md`: append a v3 → v4 bullet with one-line rationale matching the existing v1→v2 / v2→v3 style.

**Tests:**
- New `apps/web/tests/importers/openapi.extensions.test.ts`: covers operation with `x-codeSamples` and `x-internal` being captured onto `endpoint.extensions`; `x-folder` still consumed as folder (not duplicated); operation without any `x-*` leaves `extensions` undefined.
- New `apps/web/tests/exporters/openapi.extensions.test.ts`: covers `endpoint.extensions: { 'x-codeSamples': [...] }` appearing on the exported operation; undefined extensions → no keys added.
- New `apps/web/tests/importers/openapi.roundtrip.extensions.test.ts` (or extend one of the existing round-trip tests): import → export → import produces deep-equal extensions.

No new dependencies. No changes to the web UI.
