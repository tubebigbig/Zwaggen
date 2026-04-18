# Polish sweep — three follow-ups from review notes

**Status**: draft
**Date**: 2026-04-18
**Area**: `apps/web` — `RunPanel`, `icons`, `ExportMenu`, `importers/openapi`

## Problem

Across the last eight plans, code review flagged several non-blocking items we deliberately let ship and tracked for a later sweep:

1. **`collectMissingVars` treats secrets as missing.** `RunPanel.tsx:59–71` builds the `known` map from only non-secret env variables, so any endpoint whose base URL / headers / body reference `{{TOKEN}}` (where `TOKEN` is a secret) triggers the "undefined variable" confirm dialog on every Send and Copy-as-cURL, even when the secret is filled in IndexedDB. Users see a friction dialog that they have to dismiss every time.
2. **`IconChevron` and `IconChevronDown` duplicate the same SVG path.** `icons.tsx:44` and `icons.tsx:65` draw the same down-arrow. `IconChevron` pre-dated the named set; `IconChevronDown` was added when the endpoint-sidebar grouping needed a clearly-named glyph. Both still exist; `ExportMenu.tsx:25` uses the older `IconChevron`. A future reader has to learn which one is "current".
3. **`readAllOf` drops `description` and `strict` from merged objects.** `importers/openapi.ts:417–440` builds a fresh `{ kind: 'object', fields }` from the merged parts, discarding any `description` or `additionalProperties: false` present on the constituent schemas. Imported OpenAPI docs with `allOf` lose those hints.

None is a blocker. Together they're a single sweep.

## Goal

Fix all three in one small plan. Keep the changes strictly additive to the fix — no refactors in the surrounding code.

## Non-goals

- Not fixing `act(...)` warnings in tests. That investigation is out of scope for this sweep; the warnings are non-fatal and spread across multiple test files.
- Not changing the Copy-as-cURL secret-masking behavior. The masked output stays identical; only the *missing-vars confirm dialog* stops firing for known-present secrets.
- Not restructuring `readAllOf`'s merge semantics. Field dedup stays first-write-wins.

## Requirements

### 1. `collectMissingVars` knows about secrets

`RunPanel.tsx`'s `collectMissingVars` currently:

```ts
const known: Record<string, string> = {};
if (env) for (const v of env.variables) if (!v.secret) known[v.name] = v.value;
```

Change so that a secret variable is considered **present** (and thus not "missing") when either:
- The env variable has a non-empty `value` (secret filled at load time, not stripped), OR
- A matching value exists in the IndexedDB secrets store for the active environment.

The IDB lookup is async; `collectMissingVars` is sync and called during form pre-send. Two options:

**Option A — sync with a cached snapshot.** Load secrets once on mount (or on active-env change) into a `secretsSnapshot` ref. `collectMissingVars` reads the snapshot. Stale by up to one render; acceptable because `onSend` always re-loads secrets fresh before sending.

**Option B — async collectMissingVars.** Make the function async; callers `await` it. Changes signatures of `onSend` and `onCopyCurl`; more invasive.

**Pick Option A.** Simpler, smaller blast radius. The snapshot can stale between the user defining a secret in `EnvEditor` and sending a request one render later; worst case is one extra confirm dialog after a just-added secret — acceptable.

### 2. Consolidate `IconChevron` → `IconChevronDown`

- `ExportMenu.tsx` switches `IconChevron` import to `IconChevronDown`.
- `IconChevron` export is deleted from `icons.tsx`.
- No other callers exist (verified via grep).

### 3. `readAllOf` preserves `description` and `strict`

- If any merged object part has a non-empty `description`, concatenate them in order with `\n\n` as the separator, OR (simpler) take the first non-empty `description` from the parts in order. **Pick first-non-empty** — matches the first-write-wins field-dedup model.
- If any merged object part has `strict: true`, the merged result is `strict: true`. (AND across parts semantically means "any member says strict → merged is strict".)

Return shape:

```ts
const firstDesc = parts.map((p) => p.kind === 'object' ? p.description : undefined).find((d): d is string => !!d);
const anyStrict = parts.some((p) => p.kind === 'object' && p.strict);
return {
  kind: 'object',
  fields,
  ...(firstDesc ? { description: firstDesc } : {}),
  ...(anyStrict ? { strict: true } : {}),
};
```

## Testing

1. **RunPanel** — `apps/web/tests/ui/RunPanel.secretsMissingVars.test.tsx` (new):
   - Seed: env has secret `TOKEN` with empty `value` (stripped style), IDB `zwaggen:secrets` contains `{ default: { TOKEN: 'real' } }`. Endpoint references `{{TOKEN}}` in base URL. Click Send. Assert `window.confirm` NOT called, fetch was dispatched (status-spy or fetch-spy).
   - Seed: same setup but IDB has no entry. Click Send. Assert `confirm` WAS called.
   - Seed: secret with a non-empty `value` (in-memory filled). Click Send. Assert `confirm` NOT called.
2. **ExportMenu** — existing tests, if any, must still pass (or a new smoke test that the dropdown chevron still renders).
3. **importers/openapi** — extend `apps/web/tests/importers/openapi.test.ts`:
   - `allOf` with `[{ type: 'object', description: 'a', properties: {...} }, { type: 'object', description: 'b', properties: {...} }]` → merged type has `description: 'a'`.
   - `allOf` with one object carrying `additionalProperties: false` → merged has `strict: true`.
   - `allOf` with no object having either → merged has neither (strict absence checked via `'description' in merged === false`).

## Open questions

None.
