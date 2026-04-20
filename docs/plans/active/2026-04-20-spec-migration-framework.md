# Spec version migration framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline v1→v2 branch in `packages/core/src/schema/serialize.ts` with a typed migration registry + chain walker, tighten `schemaVersion` validation, and document the "add a new version" pattern. Apps/web and the CLI consume `fromJSON` unchanged.

**Architecture:** `versions/v1.ts` freezes the pre-folder spec shape for use as the v1→v2 migration's input type. `migrations.ts` owns an ordered array of `{ from, to, migrate }` entries plus a `migrate(raw, inputVersion)` walker. `serialize.ts`'s `fromJSON` becomes a thin validator: reject non-integer `schemaVersion`, reject future versions loudly, delegate to `migrate`. Every consumer of `fromJSON` works unchanged.

**Tech Stack:** TypeScript 5.x, pnpm workspaces, Vitest (core unit tests), tsup (core bundling, already wired).

**Spec:** `docs/specs/active/2026-04-20-spec-migration-framework.md`.

**Worktree convention:** Execute via `superpowers:subagent-driven-development` from `.worktrees/spec-migration-framework` on branch `plan/spec-migration-framework`. Per-task commits, no batching. Final commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File structure

**New files**
- `packages/core/src/schema/versions/v1.ts` — frozen v1 shape for migration-input typing.
- `packages/core/src/schema/migrations.ts` — migration registry + `migrate` walker.
- `packages/core/tests/schema/migrations.test.ts` — unit tests for the walker + the v1→v2 entry.

**Modified files**
- `packages/core/src/schema/serialize.ts` — `fromJSON` rewritten; `SpecVersionError` message polished.
- `packages/core/tests/schema/serialize.test.ts` — extend for new validation cases.
- `docs/rules/spec-versioning.md` — append "Adding a new version" subsection.
- `docs/TODO.md` — add follow-up entry for user-facing load-error modal.

---

## Task 1: Frozen v1 shape (`versions/v1.ts`)

**Files:**
- Create: `packages/core/src/schema/versions/v1.ts`

This task has no tests of its own — the file exports types only. Compiler-level coverage comes through Task 2 and Task 3 using `SpecV1` as the input type of the v1→v2 migrator.

- [ ] **Step 1: Create the file**

Create `packages/core/src/schema/versions/v1.ts`:

```ts
// Frozen pre-folder spec shape. Used as the input type of the v1→v2 migration.
// When future versions change Endpoint/Spec shapes, add versions/v2.ts, v3.ts
// etc. and keep each one frozen — migrators need the OLD shape as input.

import type {
  HttpMethod,
  TypeDef,
  ParamDef,
  AuthPreset,
  ResponseDef,
  Assertions,
  Capture,
  Environment,
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
  info: {
    name: string;
    version?: string;
    description?: string;
    baseUrl?: string;
  };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: SpecV1Endpoint[];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zwaggen/core lint`
Expected: clean. The file only re-exports and declares interfaces; no runtime impact.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/schema/versions/v1.ts
git commit -m "$(cat <<'EOF'
feat(core): freeze SpecV1 shape in versions/v1.ts

Captures the pre-folder Spec/Endpoint shape so the upcoming
v1→v2 migrator can type its input as SpecV1 and its output
as Spec. Future bumps will add v2.ts, v3.ts, etc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration registry + chain walker (`migrations.ts`)

**Files:**
- Create: `packages/core/src/schema/migrations.ts`
- Create: `packages/core/tests/schema/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/schema/migrations.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { migrate, MIGRATIONS } from '../../src/schema/migrations';
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/types';

const v1Sample = {
  schemaVersion: 1,
  info: { name: 'legacy' },
  types: { User: { kind: 'object', fields: [] } },
  environments: { default: { variables: [] } },
  activeEnvironment: 'default',
  auth: { type: 'none' },
  useProxyDefault: false,
  endpoints: [],
};

describe('migrate', () => {
  test('inputVersion === CURRENT_SCHEMA_VERSION is a no-op', () => {
    const atCurrent = { ...v1Sample, schemaVersion: CURRENT_SCHEMA_VERSION };
    const out = migrate(atCurrent, CURRENT_SCHEMA_VERSION);
    expect(out).toBe(atCurrent);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('v1 → current walks the chain, stamping the version', () => {
    const out = migrate(v1Sample, 1);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Payload passes through unchanged (the v1→v2 migrator is just a version stamp).
    expect(out.types).toBe(v1Sample.types);
  });

  test('input version higher than current throws', () => {
    expect(() => migrate({ ...v1Sample, schemaVersion: 99 }, 99)).toThrow(/newer than this app supports/i);
  });

  test('input version with no migration path throws', () => {
    // 0 has no registered migration entry, so the walker has no `from: 0` to use.
    expect(() => migrate({}, 0)).toThrow(/no migration path from schemaVersion 0/i);
  });

  test('MIGRATIONS is a contiguous chain starting at 1 ending at CURRENT_SCHEMA_VERSION', () => {
    expect(MIGRATIONS.length).toBe(CURRENT_SCHEMA_VERSION - 1);
    MIGRATIONS.forEach((m, i) => {
      expect(m.from).toBe(i + 1);
      expect(m.to).toBe(i + 2);
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @zwaggen/core test tests/schema/migrations.test.ts`
Expected: FAIL — module `../../src/schema/migrations` does not exist.

- [ ] **Step 3: Implement the registry + walker**

Create `packages/core/src/schema/migrations.ts`:

```ts
import { CURRENT_SCHEMA_VERSION, type Spec } from './types';
import type { SpecV1 } from './versions/v1';

interface Migration<FromV extends number, ToV extends number> {
  from: FromV;
  to: ToV;
  /** Returns a NEW object; must never mutate the input. */
  migrate(input: any): any;
}

/**
 * Ordered ascending by `from`. Each entry's `to` must equal the next entry's
 * `from` — the chain is contiguous, so a migrator at `CURRENT_SCHEMA_VERSION - 1`
 * always exists and the walker can always reach `CURRENT_SCHEMA_VERSION` from
 * any supported version. Adding a new version = appending one entry.
 */
export const MIGRATIONS: Migration<number, number>[] = [
  {
    from: 1,
    to: 2,
    // v1 → v2: folders were added. v1 endpoints have no `folder` field;
    // `folder` is optional on v2's Endpoint so absence == root folder.
    // No data transformation — just stamp the version.
    migrate: (spec: SpecV1): Spec => ({ ...spec, schemaVersion: 2 }),
  },
];

/**
 * Walk the migration chain from `inputVersion` up to `CURRENT_SCHEMA_VERSION`.
 *
 * Throws if:
 *   - `inputVersion > CURRENT_SCHEMA_VERSION` (user needs a newer app)
 *   - no registered migration has `from === currentVersion` (chain is broken,
 *     which means a migration entry is missing — a bug)
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

- [ ] **Step 4: Re-run tests to verify green**

Run: `pnpm --filter @zwaggen/core test tests/schema/migrations.test.ts`
Expected: all 5 cases green.

- [ ] **Step 5: Run full core test suite for regressions**

Run: `pnpm --filter @zwaggen/core test && pnpm --filter @zwaggen/core lint`
Expected: all green, lint clean. The new file is imported only from the new test file at this point, so no other regressions possible.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema/migrations.ts packages/core/tests/schema/migrations.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add schema migration registry + chain walker

MIGRATIONS is an ordered array of { from, to, migrate } entries.
`migrate(raw, inputVersion)` walks the chain from inputVersion up to
CURRENT_SCHEMA_VERSION, applying each entry in order. Throws loudly
for future versions or broken chains.

Only entry today is v1 → v2 (spans the folders addition, no data
transform needed). Future version bumps add one entry each.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite `fromJSON` to use the chain + tighter validation

**Files:**
- Modify: `packages/core/src/schema/serialize.ts`
- Modify: `packages/core/tests/schema/serialize.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/schema/serialize.test.ts`:

```ts
  test('rejects a string schemaVersion with a helpful message', () => {
    expect(() => fromJSON({ schemaVersion: '1', info: { name: 'x' } })).toThrow(
      /schemaVersion must be a number/i,
    );
  });

  test('rejects a non-integer schemaVersion', () => {
    expect(() => fromJSON({ schemaVersion: 1.5, info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('rejects a negative schemaVersion', () => {
    expect(() => fromJSON({ schemaVersion: -1, info: { name: 'x' } })).toThrow(SpecVersionError);
  });

  test('rejects a future schemaVersion with a clear message', () => {
    expect(() => fromJSON({ schemaVersion: 999, info: { name: 'x' } })).toThrow(
      /newer than this app supports/i,
    );
  });
```

Also make sure these imports are in place at the top of the file (should already be):
```ts
import { fromJSON, SpecVersionError, toJSON } from '../../src/schema/serialize';
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @zwaggen/core test tests/schema/serialize.test.ts`
Expected: the four new tests fail. The "string schemaVersion" test currently throws `SpecVersionError` with the old message "does not support" — which doesn't match the new `/schemaVersion must be a number/i` regex. Confirm each failure is the expected kind (not a stray crash).

- [ ] **Step 3: Rewrite `fromJSON`**

Open `packages/core/src/schema/serialize.ts`. Replace the existing `SpecVersionError` class and `fromJSON` function with:

```ts
export class SpecVersionError extends Error {
  constructor(public readonly found: unknown) {
    super(messageFor(found));
  }
}

function messageFor(found: unknown): string {
  if (found === undefined) return 'Spec file is missing schemaVersion';
  if (typeof found !== 'number') {
    return `Spec file's schemaVersion must be a number, got ${JSON.stringify(found)} — if you edited the file by hand, make sure it's an integer (e.g., ${CURRENT_SCHEMA_VERSION}), not a string.`;
  }
  if (!Number.isInteger(found) || found < 1) {
    return `Spec file's schemaVersion must be a positive integer, got ${found}.`;
  }
  // Version is a valid positive integer but outside the migration chain —
  // either older-than-v1 (impossible by definition) or newer-than-current.
  return `Spec file uses schemaVersion ${found} which this app does not support (expected 1..${CURRENT_SCHEMA_VERSION} — v1 auto-migrates, ${CURRENT_SCHEMA_VERSION} is current).`;
}

export function fromJSON(raw: unknown): Spec {
  if (typeof raw !== 'object' || raw === null) throw new SpecVersionError(undefined);
  const v = (raw as Record<string, unknown>).schemaVersion;
  if (v === undefined) throw new SpecVersionError(undefined);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new SpecVersionError(v);
  }
  try {
    return migrate(raw, v);
  } catch (err) {
    // migrate() throws plain Errors with messages describing "newer than app"
    // or "no migration path". Re-wrap so callers get SpecVersionError.
    throw new SpecVersionError(v);
  }
}
```

Also add at the top of `serialize.ts`:

```ts
import { migrate } from './migrations';
```

Make sure `CURRENT_SCHEMA_VERSION` is already imported (it is — `from './types'`).

**Why wrap `migrate`'s errors in `SpecVersionError`?** Consumers (web, cli) already `catch` against `SpecVersionError` or just let it bubble. Preserving the single error type keeps the public API small. The original underlying message is lost by the re-wrap — that's acceptable because `messageFor(v)` for an out-of-range version is already descriptive.

- [ ] **Step 4: Run all serialize + migration tests**

Run: `pnpm --filter @zwaggen/core test tests/schema/serialize.test.ts tests/schema/migrations.test.ts`
Expected: every case green, including the pre-existing v1→v2 upgrade test that now flows through the migration chain rather than an inline branch.

- [ ] **Step 5: Run full workspace tests for downstream regressions**

Run: `pnpm --filter @zwaggen/core test && pnpm --filter @zwaggen/web test && pnpm --filter @zwaggen/cli test`
Expected: everything green. `apps/web` imports `fromJSON` via `@zwaggen/core` (after the dedupe); its openSpec + draft restore paths continue to work without code changes.

- [ ] **Step 6: Run lint across workspaces**

Run: `pnpm -r lint`
Expected: clean across core, web, cli, proxy.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/schema/serialize.ts packages/core/tests/schema/serialize.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): fromJSON delegates to the migration chain

Drop the inline `if (v === 1)` branch; fromJSON now:
  1. Validates schemaVersion is a positive integer (string, float,
     negative, or missing all throw SpecVersionError with specific
     messages).
  2. Calls migrate(raw, v) to walk the chain to CURRENT_SCHEMA_VERSION.

SpecVersionError's message varies by failure mode — the common
hand-edit mistake ("schemaVersion": "1") gets its own explanation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update the spec-versioning rule doc

**Files:**
- Modify: `docs/rules/spec-versioning.md`

- [ ] **Step 1: Append the "Adding a new version" section**

Open `docs/rules/spec-versioning.md`. Append at the end:

```markdown

## Adding a new version

Each new schemaVersion ships as one migration entry + one frozen-shape file. Follow the steps in order:

1. **Freeze the current shape.** Copy the current `Spec` + any type that's about to change into `packages/core/src/schema/versions/vN.ts` as `SpecVN` (and `SpecVNEndpoint` etc. if endpoint-level types change). Don't mutate — the existing `types.ts` remains "the current shape" for live code.
2. **Bump the version.** In `packages/core/src/schema/types.ts`, set `CURRENT_SCHEMA_VERSION = N + 1` and make whatever forward-facing type changes the new version needs (add / rename / remove fields on `Spec`, `Endpoint`, etc.).
3. **Register the migration.** Append to `MIGRATIONS` in `packages/core/src/schema/migrations.ts`:
   ```ts
   {
     from: N,
     to: N + 1,
     migrate: (spec: SpecVN): Spec => ({ /* transform here */, schemaVersion: N + 1 }),
   },
   ```
   Return a NEW object; never mutate `spec`. If the transform is non-trivial, pull it into a named helper below `MIGRATIONS` for testability.
4. **Write tests.**
   - `migrations.test.ts`: vN payload upgrades cleanly; the chain walker handles v1 → v(N+1); MIGRATIONS length still equals `CURRENT_SCHEMA_VERSION - 1` with contiguous from/to values.
   - `serialize.test.ts`: a v(N+2) payload still throws the "newer than this app supports" message.
5. **Update this doc.** Bump the "Current version" line at the top and add a new bullet below the existing v1 → v2 note documenting what v(N+1) introduced.
6. **Ship behind a release.** Because the bump changes what the loader accepts, it must travel through `release.yml` alongside any app-side code changes that depend on the new shape.

**Testing invariant:** `packages/core/tests/schema/migrations.test.ts`'s `MIGRATIONS is a contiguous chain` case makes it impossible to merge a bump without a matching migration entry. If that test fails, you skipped a step.
```

- [ ] **Step 2: Verify no broken links in the rule doc**

Run: `pnpm --filter docs build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add docs/rules/spec-versioning.md
git commit -m "$(cat <<'EOF'
docs(rules): document the "Adding a new version" pattern

Six-step checklist (freeze shape, bump, register migration, tests,
doc, ship) plus the contiguous-chain test invariant that prevents
silent version-skip merges.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: File the deferred user-facing error modal TODO

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1: Append the TODO entry**

Open `docs/TODO.md`. Under the "Follow-up from shipped work" section, add:

```markdown
- [ ] User-facing load-error modal on the web app — `apps/web/src/ui/AppHeader.tsx`'s `openSpec()` currently has no try/catch around `fromJSON`, so malformed specs or unsupported schemaVersions fail silently for the user. Show a dialog explaining which file failed, the specific error (`SpecVersionError` messages are already good), and a link to `docs/rules/spec-versioning.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs(todo): track deferred load-error modal for apps/web

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Ship checklist (post-merge, in order)

Not part of the 5 TDD tasks above. Happens after the branch merges to `main`.

1. FF-merge `plan/spec-migration-framework` → `main`, push origin.
2. Move spec + plan to `done/`, tick any affected TODO lines.
3. No CF or deploy actions needed — this touches `packages/core` internals only. Next release (`release.yml`) picks it up automatically.
