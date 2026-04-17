# Spec info + Base URL — promote baseUrl to a first-class spec field

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — schema + `SpecInfoEditor` + `RunPanel` + OpenAPI/Markdown exporters

## Problem

The base URL of an API is load-bearing information — it belongs with the spec, not in a per-session form state. Today:

- `RunPanel` holds base URL as component state initialised to the literal `'{{base}}'` (apps/web/src/ui/RunPanel.tsx:15). Every page reload resets it; the value never reaches disk.
- OpenAPI export emits no `servers[]` entry — generated clients have nowhere to point (apps/web/src/exporters/openapi.ts:30).
- Markdown export has no base-URL line in the header (apps/web/src/exporters/markdown.ts:5).
- `SpecInfoEditor` edits `name` / `version` / `description`, but has nowhere to enter the URL the whole API lives behind.

Users compensate by defining a `{{base}}` env variable. That works per-environment but means the spec without an env is useless for a human reader, and the exported OpenAPI still has no `servers` entry for tools that expect one.

## Goal

Add a single optional `baseUrl` string to `Spec.info`. Wire it into the editor, the runner, and both exports. Keep per-request override behavior in `RunPanel` so ad-hoc tests still work.

## Non-goals

- **Not multi-environment servers in one OpenAPI export.** OpenAPI allows `servers[]` per environment; we emit one entry, from `spec.info.baseUrl`. Per-env server URLs are deferred.
- **Not removing `{{base}}`-style env variables.** Users who already rely on them keep working — the new field and env vars coexist; `{{var}}` substitution still runs over the base URL.
- **Not a schema version bump.** `info.baseUrl` is optional and unknown-field tolerant on load; older specs load as `baseUrl: undefined` and never lose data. See rationale under "Schema versioning" below.
- **Not a path-rewriter.** We do not strip an absolute URL the user may have typed in `endpoint.path`. The runner concatenates `baseUrl + path` as today.

## Requirements

1. `Spec.info.baseUrl?: string` exists on the type and round-trips through `toJSON` / `fromJSON` unchanged.
2. `SpecInfoEditor` gains a Base URL input between `name` and `version`. Empty string clears the field (stored as `undefined`, not `''`, so it never appears in the JSON when absent).
3. `RunPanel` initializes its local `baseUrl` state from `spec.info.baseUrl ?? ''` and syncs when the spec's `baseUrl` changes (e.g. after Open). The user can still edit the input for an ad-hoc override without mutating the spec.
4. OpenAPI export emits `servers: [{ url: spec.info.baseUrl }]` when `baseUrl` is non-empty; when empty/absent, `servers` is omitted (not `servers: []`).
5. Markdown export emits `**Base URL:** <baseUrl>` on the line after the description when `baseUrl` is present.
6. No change to the runner's variable-substitution behavior — `{{var}}` in `baseUrl` still resolves against the active environment.

## Design

### Schema layer — `apps/web/src/schema/types.ts`

```ts
export interface Spec {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  // ...unchanged
}
```

**Schema versioning**: adding an optional field to `info` does not trigger a bump per `docs/rules/spec-versioning.md`. Old readers can still load new specs (they just ignore the unknown field). Old specs load as `baseUrl: undefined` under the new reader. `toJSON` emits the field only when defined (already the case — `JSON.stringify` drops `undefined`). No migration needed.

### Editor — `apps/web/src/ui/SpecInfoEditor.tsx`

Insert the new input between `name` and `version`. Follow the existing `patch({ version: e.target.value || undefined })` pattern so an empty input round-trips to `undefined`.

```tsx
<label className="block">
  <span className="text-xs text-slate-500">{t('baseUrl')}</span>
  <input
    aria-label={t('baseUrl')}
    className="input mt-1 font-mono text-xs"
    value={info.baseUrl ?? ''}
    placeholder="https://api.example.com"
    onChange={(e) => patch({ baseUrl: e.target.value || undefined })}
  />
</label>
```

The i18n key `baseUrl` already exists in both locales (grep confirms it).

### Runner — `apps/web/src/ui/RunPanel.tsx`

Replace the default-`'{{base}}'` local state with a spec-sourced initializer and a sync effect:

```ts
const [baseUrl, setBaseUrl] = useState(spec.info.baseUrl ?? '');

useEffect(() => {
  setBaseUrl(spec.info.baseUrl ?? '');
}, [spec.info.baseUrl]);
```

Semantics:
- Typing in the field updates the local `baseUrl` only — the spec is not touched. This keeps the per-request override and matches the existing "spec vs ad-hoc" split already present for `useProxy`.
- Opening a different spec or editing the Base URL in `SpecInfoEditor` resets the override.
- `sendRequest` already consumes `baseUrl` as a parameter; no runner change.

### Exporters

**OpenAPI** — `apps/web/src/exporters/openapi.ts`:

```ts
const doc: any = {
  openapi: '3.1.0',
  info: { title: spec.info.name, version: spec.info.version ?? '0.1.0', description: spec.info.description },
  paths,
  components: { schemas },
};
if (spec.info.baseUrl) doc.servers = [{ url: spec.info.baseUrl }];
return doc;
```

Do not emit `servers: []` when `baseUrl` is empty — the OpenAPI 3.1 default (implicit `/`) is the correct behavior for a spec without a declared server.

**Markdown** — `apps/web/src/exporters/markdown.ts`:

After the description push, before the Types heading:

```ts
if (spec.info.baseUrl) out.push(`**Base URL:** \`${spec.info.baseUrl}\`\n`);
```

## Testing

### Unit — serialize round-trip

Extend `apps/web/tests/schema/serialize.test.ts`:
- A spec with `info.baseUrl = 'https://api.example.com'` round-trips through `toJSON` / `fromJSON` unchanged.
- A spec without `baseUrl` emits JSON that does *not* contain the `"baseUrl"` key (snapshot the stringified `info`).

### Unit — OpenAPI exporter

Extend `apps/web/tests/exporters/openapi.test.ts`:
- `toOpenApi(specWithBaseUrl)` returns `servers: [{ url: 'https://api.example.com' }]`.
- `toOpenApi(specWithoutBaseUrl)` returns an object where `'servers' in result === false`.

### Unit — Markdown exporter

Extend `apps/web/tests/exporters/markdown.test.ts`:
- Markdown contains the line `**Base URL:** \`https://api.example.com\`` when the field is set.
- Markdown contains no `**Base URL:**` substring when the field is absent.

### Component — `SpecInfoEditor`

New file `apps/web/tests/ui/SpecInfoEditor.test.tsx`:
- Typing into the Base URL input patches `spec.info.baseUrl`.
- Clearing the input stores `undefined` (asserted by checking `JSON.stringify(info)` does not contain the key).

### Component — `RunPanel`

Extend `apps/web/tests/ui/RunPanel.test.tsx` (create if missing):
- When `spec.info.baseUrl` is `'https://api.example.com'`, the Base URL input is initialized to that value.
- When the spec's `baseUrl` changes (e.g., after a simulated spec swap), the input reflects the new value.
- Typing an override in the input does *not* mutate `spec.info.baseUrl`.

## Error handling

Empty string in the input → stored as `undefined`. No new alert surfaces, no new error paths. If a user types a non-URL string, the runner's existing `new URL(...)` call in `sendRequest` will throw — that already flows through `classify-error` as a network error, unchanged by this feature.

## Open questions

None.
