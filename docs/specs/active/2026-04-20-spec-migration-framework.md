# Spec — Spec version migration framework

**Status:** active
**Date:** 2026-04-20
**Scope:** `packages/core/src/schema/` plus `docs/rules/spec-versioning.md`. Web + CLI automatically benefit through the existing `fromJSON` call sites.

## Goal

Replace the ad-hoc `if (v === 1)` branch in `fromJSON` with a small, typed chain-of-migrations registry so that every future schemaVersion bump adds exactly one migration entry (plus a version-typed interface when the shape actually changes) and `fromJSON` still loads any historical version by walking the chain up to `CURRENT_SCHEMA_VERSION`. Also tighten error messages for the cases users hit most — hand-edited schemaVersion strings, missing field, unknown future version.

## Motivation

The current `fromJSON` handles a single v1→v2 step inline:

```ts
if (v === 1) return { ...obj, schemaVersion: 2 };
if (v !== 2) throw new SpecVersionError(v);
```

This works today, but when we ship v3 we'd either chain more `if`s (fragile) or drop v1 support (user-hostile). A v1 user opening a v10 spec-aware app should still get their data — that's the contract. A small registry makes each bump a safe, reviewable, test-covered diff.

Typing-wise, the current `Spec` is "the current version". To migrate between versions safely we need per-version shapes (`SpecV1`, `SpecV2`, …) and migration functions typed `(SpecVn) => SpecVn+1`. This lets compilers catch migration mismatches at build time.

## Non-goals

- **User-facing load-error modal.** The `openSpec` flow in `apps/web/src/ui/AppHeader.tsx` has no try/catch around `fromJSON`; load failures propagate silently. That's a real UX hole but a separate feature. Tracked as a TODO entry.
- **Structural validation beyond the version gate.** If a user hand-edits a v2 spec to remove `info` or corrupt `endpoints`, `fromJSON` still trusts the payload. The rule doc covers this intentional non-goal.
- **Downgrades.** Migrations only move forward. A v3 spec opened in a v2-era app fails with `SpecVersionError(3)` — same behavior as today.
- **Migration of non-version fields.** e.g., we don't touch `environments`, `auth`, or endpoint payloads during migration unless a future version explicitly requires it.
- **Renaming `Spec` to `SpecV2`.** The exported type stays `Spec = the current version`. `SpecV2` is just the identifier for the frozen v2 shape; we'll introduce it lazily (see below).
- **Changes to `apps/web` or `packages/cli`.** They consume `fromJSON` unchanged. Zero churn in consumer code.

## Design

### File layout under `packages/core/src/schema/`

```
schema/
├── types.ts                   ← existing; exports current `Spec` (= SpecV2)
├── serialize.ts               ← existing; `fromJSON` / `toJSON` rewritten to walk the chain
├── versions/
│   └── v1.ts                  ← NEW; frozen v1 shape for migration input typing
└── migrations.ts              ← NEW; registry + chain walker
```

### `versions/v1.ts` — the frozen pre-folder shape

A single file that captures the `Spec` shape as it was BEFORE the folders feature. Everything except `Endpoint.folder` is identical to `Spec`, so we can re-export most types from `types.ts` and override only what changed. Effectively:

```ts
import type {
  HttpMethod, TypeDef, ParamDef, AuthPreset, ResponseDef, Assertions, Capture,
  EnvVariable, Environment,
} from '../types';

export interface SpecV1Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];
  queryParams: ParamDef[];
  headers: ParamDef[];
  requestBody: TypeDef | null;
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  // NOTE: no `folder` field — v1 predates folders.
  assertions?: Assertions;
  captures?: Capture[];
}

export interface SpecV1 {
  schemaVersion: 1;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: SpecV1Endpoint[];
}
```

Why freeze the shape rather than just reuse `Spec`? Because when we bump to v3 and (say) rename `info.baseUrl` → `info.servers[]`, `SpecV2`'s `info` will no longer equal `SpecV3`'s. The migrator needs the OLD shape as input type and the NEW shape as output type; keeping each version's shape in its own file lets TypeScript verify the migrator signature.

### `migrations.ts` — the registry + chain walker

```ts
import { CURRENT_SCHEMA_VERSION } from './types';
import type { Spec } from './types';
import type { SpecV1 } from './versions/v1';

interface Migration<FromV extends number, ToV extends number> {
  from: FromV;
  to: ToV;
  migrate(input: any): any;
}

// Ordered ascending by `from`. Each entry's `to` must equal the next entry's `from`.
export const MIGRATIONS: Migration<number, number>[] = [
  {
    from: 1,
    to: 2,
    migrate: (spec: SpecV1): Spec => ({ ...spec, schemaVersion: 2 }),
  },
  // Future entries append here — see docs/rules/spec-versioning.md for the pattern.
];

/**
 * Walk the migration chain from `inputVersion` up to `CURRENT_SCHEMA_VERSION`.
 * Throws if the chain is broken (unknown start, gap between entries, or input
 * version higher than current).
 */
export function migrate(raw: unknown, inputVersion: number): Spec {
  if (inputVersion === CURRENT_SCHEMA_VERSION) return raw as Spec;
  if (inputVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Spec file uses schemaVersion ${inputVersion} which is newer than this app supports (current: ${CURRENT_SCHEMA_VERSION}). Update the app.`,
    );
  }
  let current: any = raw;
  let currentVersion = inputVersion;
  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === currentVersion);
    if (!step) {
      throw new Error(
        `No migration path from schemaVersion ${currentVersion} to ${CURRENT_SCHEMA_VERSION}. This is a bug — a migration entry is missing.`,
      );
    }
    current = step.migrate(current);
    currentVersion = step.to;
  }
  return current as Spec;
}
```

Keeping the registry an ordered array (not a map) makes "what migrations exist, in what order" readable at a glance and is easy to diff when we add a new entry.

### `serialize.ts` rewrite — `fromJSON` becomes a thin version gate

```ts
export function fromJSON(raw: unknown): Spec {
  if (typeof raw !== 'object' || raw === null) {
    throw new SpecVersionError(undefined);
  }
  const v = (raw as Record<string, unknown>).schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new SpecVersionError(v);
  }
  return migrate(raw, v);
}
```

Note the tightening: `schemaVersion` must be an integer ≥ 1. String `"1"`, float `1.5`, negative, or `undefined` all fail with a clear error. The `SpecVersionError` message gets a tiny update to distinguish the "string-not-number" case, which is the most common hand-edit mistake.

### `SpecVersionError` message improvements

Two changes:

1. When `found` is `undefined`: current message "Spec file is missing schemaVersion" stays.
2. When `found` is a non-number (e.g., `"1"`): new message "Spec file's schemaVersion must be a number, got `\"1\"` — if you edited the file by hand, check it's an integer (e.g., `2`), not a string."
3. When `found` is a number outside current range: current message stays but with a small nudge — "... expected up to 2" becomes "... expected 1..2 (v1 auto-migrates, v2 is current)".

These are prose improvements; exact wording can drift in the implementation plan.

### Docs update — `docs/rules/spec-versioning.md`

New "Adding a new version" subsection with the exact steps for future-me (or future Claude):

1. Freeze the current shape in `packages/core/src/schema/versions/vN.ts`, copying anything that's about to change.
2. Update `packages/core/src/schema/types.ts`: bump `CURRENT_SCHEMA_VERSION` to `N+1`, make whatever type changes are needed (new fields, renamed fields, new constraints).
3. Append a migration entry to `packages/core/src/schema/migrations.ts` with `from: N, to: N+1, migrate: (SpecVn) => Spec => { ... }`.
4. Tests: add cases for `v(N)` spec loads + upgrades correctly; confirm v(N-1) still works (chain traversal); confirm v(N+2) future throws.
5. Update `docs/rules/spec-versioning.md`'s current-version line and add a new bullet documenting what v(N+1) added.

### Testing

- `packages/core/tests/schema/migrations.test.ts` (new):
  - `migrate({...}, 1)` returns a valid v2 spec with `schemaVersion === 2`.
  - `migrate({...}, 2)` returns input unchanged (no-op).
  - `migrate({...}, 99)` throws with the "newer than this app supports" message.
  - `migrate({...}, 0)` throws with the "no migration path" message (no migration from 0 exists).
- `packages/core/tests/schema/serialize.test.ts` (extend):
  - `fromJSON({ schemaVersion: "1", ... })` throws `SpecVersionError` with the new "must be a number" message.
  - `fromJSON({ schemaVersion: 1.5, ... })` throws (non-integer).
  - `fromJSON({ schemaVersion: -1, ... })` throws.
  - Existing v1→v2 upgrade test keeps passing (now going through the chain).

### Edge cases

- **Skip-version specs** (hypothetical v3 file opened on v2 app): the `inputVersion > CURRENT_SCHEMA_VERSION` check throws before we try to walk the chain forward past the current version.
- **Missing migration entry** (`from: 1, to: 2` + `from: 3, to: 4` with v2 input): chain walker throws because no `from: 2` entry exists. This is the "bug — missing migration" case the rule doc flags.
- **Non-integer schemaVersion**: serialize's version gate rejects before `migrate` runs.
- **Migration mutates input**: the v1→v2 migrator uses spread (`{...spec, schemaVersion: 2}`) so the caller's object isn't mutated. Future migrators must follow the same pattern; the rule doc will call this out.

## Open questions

None — decided: registry-of-migrations in an array, lazy version-typed interfaces (only add when shape drifts), thin `fromJSON` gate, tighter error messages, no user-facing alert in this scope (tracked as a separate TODO).
