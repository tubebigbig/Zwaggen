# Codegen library + slice API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move codegen from `packages/cli/src/generate/` into `@zwaggen/core/codegen/` and add a `resolveSlice` API + optional `{ only? }` filter on every generator. Foundation for export buttons & live preview (Slice 2).

**Architecture:** File moves preserve logic; one new pure module (`closure.ts`) does the slice resolution. The CLI imports the moved exports back from `@zwaggen/core` — its commands behave identically. The web app (untouched in this slice) gains the ability to import `generateTs` etc.

**Tech Stack:** TypeScript, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-24-codegen-slice-api.md`. Key constraints:

- Move (not copy) — files leave the CLI source tree.
- `types.ts` renames to `ts.ts` to avoid shadowing `schema/types.ts`.
- CLI behavior is identical after the move.
- All existing codegen tests keep passing without modification (only their import paths shift).
- New closure tests cover endpoint/type/folder slicing + transitive ref walking + extends parents + unresolvedRefs surface.

---

### Task 1: Move `helpers.ts` into core

**Files:**
- Move: `packages/cli/src/generate/helpers.ts` → `packages/core/src/codegen/helpers.ts`

`helpers.ts` is the leaf — no other generate-files would compile if its move broke. Move it first so subsequent moves can land safely.

- [ ] **Step 1: `git mv` and patch the one cross-package import**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/codegen-slice-api
mkdir -p packages/core/src/codegen
git mv packages/cli/src/generate/helpers.ts packages/core/src/codegen/helpers.ts
```

Open `packages/core/src/codegen/helpers.ts`. Change line 1 from:

```ts
import type { Endpoint } from '@zwaggen/core';
```

to:

```ts
import type { Endpoint } from '../schema/types';
```

(After the move, `@zwaggen/core` would be a self-import; relative path is cleaner and avoids a circular declaration during build.)

- [ ] **Step 2: Update CLI import sites**

The remaining `packages/cli/src/generate/` files import from `./helpers.js`:
- `types.ts` (line 10)
- `zod.ts` (line 9)
- `client.ts` (line 2)

These will be moved next; for now, point them at `@zwaggen/core` so the CLI compiles between moves:

```bash
# From the worktree root:
sed -i '' "s|from './helpers.js'|from '@zwaggen/core'|g" packages/cli/src/generate/types.ts packages/cli/src/generate/zod.ts packages/cli/src/generate/client.ts
```

**But** — `helpers.ts`'s exports aren't on `@zwaggen/core`'s public surface yet. Add a temporary `export * from './codegen/helpers';` to `packages/core/src/index.ts` (we'll keep it permanent, but it goes in now to unbreak the CLI between tasks).

- [ ] **Step 3: Verify**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
```

All green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/codegen/helpers.ts packages/cli/src/generate packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
refactor(core): move codegen helpers into @zwaggen/core

Pure file move + import-path update. CLI now imports the helpers
back from @zwaggen/core. First step in moving the entire codegen
into core so the web app can call it (foundation for export
buttons + live preview).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Move `types.ts` → `codegen/ts.ts`

**Files:**
- Move + rename: `packages/cli/src/generate/types.ts` → `packages/core/src/codegen/ts.ts`

The rename avoids shadowing `packages/core/src/schema/types.ts`.

- [ ] **Step 1: `git mv` with rename**

```bash
git mv packages/cli/src/generate/types.ts packages/core/src/codegen/ts.ts
```

- [ ] **Step 2: Patch internal imports**

In `packages/core/src/codegen/ts.ts`:
- Line 1–9: `from '@zwaggen/core'` for the schema imports → change to `from '../schema/types'` (or split across `../schema/...` modules as appropriate).
- Line 10: `from '@zwaggen/core'` (the helpers import patched in Task 1) → change to `from './helpers'`.

In CLI files that import the old path:
- `packages/cli/src/generate/zod.ts` line 10: `import { detectKeyCollisions } from './types.js';` → `from '@zwaggen/core'`.
- `packages/cli/src/generate/client.ts` line 3: same.
- `packages/cli/src/generate/index.ts` line 23: dynamic `import('./types.js')` → `import('@zwaggen/core')`.

- [ ] **Step 3: Re-export from core**

Add to `packages/core/src/index.ts`:

```ts
export * from './codegen/ts';
```

(Keep the helpers re-export from Task 1.)

- [ ] **Step 4: Verify**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
```

All green. Codegen output for the CLI's existing tests must be byte-identical (no behavior change yet).

- [ ] **Step 5: Move tests too**

Find the existing tests for `generateTs`:

```bash
grep -rl "generateTs\|generate/types" packages/cli/tests | head
```

`git mv` them into `packages/core/tests/codegen/`. Update import paths inside the moved files (`../../src/generate/types.js` → `../../src/codegen/ts.js`, etc.).

```bash
pnpm --filter @zwaggen/core test
```

All passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): move generateTs into @zwaggen/core/codegen/ts

Renamed file from `types.ts` to `ts.ts` to avoid shadowing
`schema/types.ts` in the core tree. Tests moved alongside the
source. CLI re-imports the export from @zwaggen/core; output is
byte-identical.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move `zod.ts` into core

**Files:**
- Move: `packages/cli/src/generate/zod.ts` → `packages/core/src/codegen/zod.ts`

- [ ] **Step 1: `git mv`**

```bash
git mv packages/cli/src/generate/zod.ts packages/core/src/codegen/zod.ts
```

- [ ] **Step 2: Patch imports**

In `packages/core/src/codegen/zod.ts`:
- Schema imports `from '@zwaggen/core'` → `from '../schema/types'` (or relevant module).
- `from '@zwaggen/core'` (helpers patched in Task 1) → `from './helpers'`.
- `from '@zwaggen/core'` (detectKeyCollisions, patched in Task 2) → `from './ts'`.

In CLI:
- `packages/cli/src/generate/index.ts` line 27: `import('./zod.js')` → `import('@zwaggen/core')`.

- [ ] **Step 3: Re-export from core**

Add to `packages/core/src/index.ts`:

```ts
export * from './codegen/zod';
```

- [ ] **Step 4: Move tests**

```bash
grep -rl "generateZod\|generate/zod" packages/cli/tests | head
```

`git mv` into `packages/core/tests/codegen/`. Update import paths.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/cli test
```

All green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): move generateZod into @zwaggen/core/codegen/zod

CLI re-imports from @zwaggen/core; output identical.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Move `client.ts` into core

**Files:**
- Move: `packages/cli/src/generate/client.ts` → `packages/core/src/codegen/client.ts`

Same pattern.

- [ ] **Step 1: `git mv` + patch imports**

```bash
git mv packages/cli/src/generate/client.ts packages/core/src/codegen/client.ts
```

In `packages/core/src/codegen/client.ts`:
- Schema imports → relative paths.
- `from '@zwaggen/core'` (helpers) → `from './helpers'`.
- `from '@zwaggen/core'` (detectKeyCollisions) → `from './ts'`.

In CLI `index.ts` line 31: `import('./client.js')` → `import('@zwaggen/core')`.

- [ ] **Step 2: Re-export + move tests**

Add to `packages/core/src/index.ts`:

```ts
export * from './codegen/client';
```

Move client tests from `packages/cli/tests` → `packages/core/tests/codegen/`.

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/cli test
pnpm --filter web build  # ensure the web app still compiles against the new core surface
```

All green.

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): move generateClient into @zwaggen/core/codegen/client

Final codegen file moved into core. CLI now consumes the entire
codegen surface from @zwaggen/core; its dynamic-import dance for
--no-types/--no-schemas survives unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Refactor `detectKeyCollisions` to accept `{ endpoints, types }`

**Files:**
- Modify: `packages/core/src/codegen/ts.ts` — change `detectKeyCollisions` signature.
- Modify: callers in `packages/core/src/codegen/zod.ts`, `packages/core/src/codegen/client.ts`.

The current signature is `detectKeyCollisions(spec: Spec)`. After Task 6, callers will pass a `ResolvedSlice` (`{ endpoints, types }`) which is structurally `Spec`-like for these two fields but lacks all the others. Widen the parameter type.

- [ ] **Step 1: Read the current impl**

```bash
grep -n "detectKeyCollisions" packages/core/src/codegen/*.ts
```

Find the function's definition and every call site.

- [ ] **Step 2: Change the signature**

```ts
export function detectKeyCollisions(input: {
  endpoints: readonly Endpoint[];
  types: ReadonlyMap<string, TypeDef> | readonly TypeDef[];
}): { ... existing return shape ... }
```

If the implementation reads `spec.types` as a `Map`, accept both `Map` and `TypeDef[]` and normalize at the top.

Update the body to read `input.endpoints` / `input.types`. Update every call site to pass `spec` or `{ endpoints: spec.endpoints, types: spec.types }` — at this point all callers still pass the full spec, so just `(spec)` works since `spec` matches the new structural type.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @zwaggen/core test
```

Same tests, same output.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/codegen
git commit -m "$(cat <<'EOF'
refactor(core/codegen): widen detectKeyCollisions to accept slice shape

Accepts { endpoints, types } instead of full Spec, so the upcoming
slice API can call it on a filtered subset. Behavior unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add `resolveSlice` (closure.ts)

**Files:**
- Create: `packages/core/src/codegen/closure.ts`
- Create: `packages/core/tests/codegen/closure.test.ts`

- [ ] **Step 1: Write the failing test file first (TDD)**

`packages/core/tests/codegen/closure.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptySpec, type Spec, type ObjectType, type RefType } from '../../src';
import { resolveSlice } from '../../src/codegen/closure';

function specFixture(): Spec {
  const s = emptySpec();
  // Three types: User → has Address (ref); Address; Company (unrelated)
  s.types.set('User', {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'literal', literal: 'string' } },
      { name: 'address', required: false, type: { kind: 'ref', ref: 'Address' } },
    ],
  } as ObjectType);
  s.types.set('Address', {
    kind: 'object',
    fields: [
      { name: 'street', required: true, type: { kind: 'literal', literal: 'string' } },
    ],
  } as ObjectType);
  s.types.set('Company', {
    kind: 'object',
    fields: [{ name: 'name', required: true, type: { kind: 'literal', literal: 'string' } }],
  } as ObjectType);
  s.endpoints = [
    {
      id: 'getUser', method: 'GET', path: '/users/:id',
      pathParams: [{ name: 'id', required: true, type: { kind: 'literal', literal: 'string' } }],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
      auth: 'inherit', useProxy: 'inherit',
    },
    {
      id: 'getCompany', method: 'GET', path: '/companies',
      pathParams: [], requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'Company' } as RefType }],
      auth: 'inherit', useProxy: 'inherit',
    },
  ];
  return s;
}

describe('resolveSlice', () => {
  it('returns full spec when slice is undefined', () => {
    const spec = specFixture();
    const r = resolveSlice(spec);
    expect(r.endpoints).toHaveLength(2);
    expect(r.types.length).toBe(3);
    expect(r.unresolvedRefs).toEqual([]);
  });

  it('endpointIds pulls only those endpoints + their type closure', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, { endpointIds: ['getUser'] });
    expect(r.endpoints.map((e) => e.id)).toEqual(['getUser']);
    // User + Address transitive — Company excluded
    const typeNames = r.types.map((_t, i) => Array.from(spec.types.keys()).find((k) => spec.types.get(k) === r.types[i]));
    // Simpler: assert the type set
    const keys = new Set<string>();
    for (const [k, t] of spec.types) if (r.types.includes(t)) keys.add(k);
    expect(keys).toEqual(new Set(['User', 'Address']));
  });

  it('typeKeys pulls only those types + transitive refs', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, { typeKeys: ['User'] });
    expect(r.endpoints).toEqual([]);
    const keys = new Set<string>();
    for (const [k, t] of spec.types) if (r.types.includes(t)) keys.add(k);
    expect(keys).toEqual(new Set(['User', 'Address']));
  });

  it('typeKeys pulls extends parents transitively', () => {
    const spec = specFixture();
    spec.types.set('Admin', {
      kind: 'object',
      extends: ['User'],
      fields: [{ name: 'role', required: true, type: { kind: 'literal', literal: 'string' } }],
    } as ObjectType);
    const r = resolveSlice(spec, { typeKeys: ['Admin'] });
    const keys = new Set<string>();
    for (const [k, t] of spec.types) if (r.types.includes(t)) keys.add(k);
    expect(keys).toEqual(new Set(['Admin', 'User', 'Address']));
  });

  it('folderPrefix matches folder and subfolders, not unrelated names', () => {
    const spec = specFixture();
    spec.types.set('auth/Token', { kind: 'object', fields: [] } as ObjectType);
    spec.types.set('auth/oauth/Code', { kind: 'object', fields: [] } as ObjectType);
    spec.types.set('authentication/Session', { kind: 'object', fields: [] } as ObjectType);
    const r = resolveSlice(spec, { folderPrefix: 'auth' });
    const keys = new Set<string>();
    for (const [k, t] of spec.types) if (r.types.includes(t)) keys.add(k);
    expect(keys).toEqual(new Set(['auth/Token', 'auth/oauth/Code']));
  });

  it('combines endpointIds + typeKeys + folderPrefix as a union', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, {
      endpointIds: ['getCompany'],
      typeKeys: ['User'],
    });
    expect(r.endpoints.map((e) => e.id)).toEqual(['getCompany']);
    const keys = new Set<string>();
    for (const [k, t] of spec.types) if (r.types.includes(t)) keys.add(k);
    expect(keys).toEqual(new Set(['User', 'Address', 'Company']));
  });

  it('unresolved refs surface in unresolvedRefs', () => {
    const spec = specFixture();
    spec.endpoints[0]!.responses = [
      { status: 200, type: { kind: 'ref', ref: 'NotARealType' } as RefType },
    ];
    const r = resolveSlice(spec, { endpointIds: ['getUser'] });
    expect(r.unresolvedRefs).toEqual(['NotARealType']);
  });

  it('preserves spec ordering for filtered results', () => {
    const spec = specFixture();
    const r = resolveSlice(spec, { endpointIds: ['getCompany', 'getUser'] });
    // Spec order: getUser first, getCompany second — preserved regardless of input order
    expect(r.endpoints.map((e) => e.id)).toEqual(['getUser', 'getCompany']);
  });
});
```

- [ ] **Step 2: Run the test, expect all to fail with module-not-found**

```bash
pnpm --filter @zwaggen/core test packages/core/tests/codegen/closure.test.ts
```

Expected: 8 failures, all citing `Cannot find module '../../src/codegen/closure'`.

- [ ] **Step 3: Implement `resolveSlice`**

`packages/core/src/codegen/closure.ts`:

```ts
import type { Spec, Endpoint, TypeDef, ObjectType, ArrayType, UnionType, RefType, ParamDef } from '../schema/types';

export interface CodegenSlice {
  endpointIds?: string[];
  typeKeys?: string[];
  folderPrefix?: string;
}

export interface ResolvedSlice {
  endpoints: Endpoint[];
  types: TypeDef[];
  unresolvedRefs: string[];
}

export function folderMatchesPrefix(folder: string | undefined, prefix: string): boolean {
  if (!folder) return prefix === '';
  if (folder === prefix) return true;
  return folder.startsWith(prefix + '/');
}

function collectRefsFromType(t: TypeDef, into: Set<string>): void {
  switch (t.kind) {
    case 'ref':
      into.add(t.ref);
      return;
    case 'array':
      collectRefsFromType((t as ArrayType).items, into);
      return;
    case 'object': {
      const o = t as ObjectType;
      for (const ext of o.extends ?? []) into.add(ext);
      for (const f of o.fields) collectRefsFromType(f.type, into);
      return;
    }
    case 'union':
      for (const v of (t as UnionType).variants) collectRefsFromType(v, into);
      return;
    default:
      return;
  }
}

function collectRefsFromEndpoint(ep: Endpoint, into: Set<string>): void {
  for (const p of ep.pathParams) collectRefsFromType(p.type, into);
  if (ep.queryParams) collectRefsFromType(ep.queryParams as TypeDef, into);
  if (ep.headers) collectRefsFromType(ep.headers as TypeDef, into);
  if (ep.requestBody) collectRefsFromType(ep.requestBody, into);
  for (const f of ep.bodyForm ?? []) collectRefsFromType(f.type, into);
  for (const r of ep.responses) collectRefsFromType(r.type, into);
}

export function resolveSlice(spec: Spec, slice?: CodegenSlice): ResolvedSlice {
  if (!slice || (!slice.endpointIds && !slice.typeKeys && slice.folderPrefix === undefined)) {
    return {
      endpoints: spec.endpoints.slice(),
      types: Array.from(spec.types.values()),
      unresolvedRefs: [],
    };
  }

  const endpointIdSet = new Set(slice.endpointIds ?? []);
  const includedEndpoints = spec.endpoints.filter((ep) => {
    if (endpointIdSet.has(ep.id)) return true;
    if (slice.folderPrefix !== undefined && folderMatchesPrefix(ep.folder, slice.folderPrefix)) return true;
    return false;
  });

  const typeKeysSet = new Set<string>(slice.typeKeys ?? []);
  if (slice.folderPrefix !== undefined) {
    for (const key of spec.types.keys()) {
      const lastSlash = key.lastIndexOf('/');
      const folder = lastSlash >= 0 ? key.slice(0, lastSlash) : undefined;
      if (folderMatchesPrefix(folder, slice.folderPrefix)) typeKeysSet.add(key);
    }
  }

  const refQueue = new Set<string>(typeKeysSet);
  for (const ep of includedEndpoints) collectRefsFromEndpoint(ep, refQueue);

  const resolved = new Map<string, TypeDef>();
  const unresolved = new Set<string>();
  const work = Array.from(refQueue);
  while (work.length > 0) {
    const ref = work.shift()!;
    if (resolved.has(ref) || unresolved.has(ref)) continue;
    const t = spec.types.get(ref);
    if (!t) { unresolved.add(ref); continue; }
    resolved.set(ref, t);
    const downstream = new Set<string>();
    collectRefsFromType(t, downstream);
    for (const d of downstream) if (!resolved.has(d) && !unresolved.has(d)) work.push(d);
  }

  // Preserve spec.types insertion order
  const orderedTypes: TypeDef[] = [];
  for (const [key, t] of spec.types) if (resolved.has(key)) orderedTypes.push(t);

  return {
    endpoints: includedEndpoints,
    types: orderedTypes,
    unresolvedRefs: Array.from(unresolved).sort(),
  };
}
```

- [ ] **Step 4: Re-export + run tests**

Add to `packages/core/src/index.ts`:

```ts
export * from './codegen/closure';
```

Run:

```bash
pnpm --filter @zwaggen/core test packages/core/tests/codegen/closure.test.ts
```

All 8 tests green. If any fails, iterate the implementation, never the test (unless the test is wrong).

Then full suite:

```bash
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/cli test
pnpm --filter web build
```

All green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/codegen/closure.ts packages/core/tests/codegen/closure.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core/codegen): add resolveSlice for partial-spec exports

resolveSlice(spec, { endpointIds?, typeKeys?, folderPrefix? }) walks
the transitive type-reference closure (plus extends parents) and
returns { endpoints, types, unresolvedRefs }. Foundation for
per-endpoint / per-type / per-folder export buttons.

When slice is undefined, returns the full spec — preserves the
existing default for every codegen entry point.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire `{ only? }` into the four generators

**Files:**
- Modify: `packages/core/src/codegen/ts.ts`
- Modify: `packages/core/src/codegen/zod.ts`
- Modify: `packages/core/src/codegen/client.ts`
- Modify: `packages/core/src/exporters/openapi.ts`

Each generator gains an optional second arg. When provided, it iterates the slice; when not, it iterates the full spec (unchanged default). All existing tests (which don't pass the second arg) continue to pass.

- [ ] **Step 1: `generateTs`**

```ts
import { resolveSlice, type CodegenSlice } from './closure';

export function generateTs(spec: Spec, opts?: { only?: CodegenSlice }): string {
  const slice = resolveSlice(spec, opts?.only);
  const collisions = detectKeyCollisions({ endpoints: slice.endpoints, types: spec.types });
  // ... rest of existing body, but iterate slice.endpoints and slice.types ...
}
```

The function still references `spec` for things outside the slice (e.g., `spec.info` for the header comment, `spec.types` for `detectKeyCollisions` which needs the full key map for collision detection — collisions are a global concern, not per-slice). Audit each `spec.endpoints` / `spec.types` reference:

- Iteration of "what to emit" → `slice.endpoints` / `slice.types`
- Lookups (e.g., resolving a ref's TypeDef when emitting an `extends` clause) → still `spec.types` (the closure may include parents that aren't in the slice's `typeKeys` list but are in `slice.types`; `spec.types` is the authoritative map for ref resolution)

In fact, since `slice.types` is filtered to exactly the closure, every ref the slice's emitted code might encounter resolves inside `slice.types`. Use `slice.types` for emission iteration; use `spec.types` (or a derived `Map`) for lookups.

- [ ] **Step 2: `generateZod`**

Same pattern.

- [ ] **Step 3: `generateClient`**

Same pattern. Note `client.ts` builds a `referencedTypes` list (line 44) — that becomes implicit (the slice already gives the right set).

- [ ] **Step 4: `toOpenApi`**

```ts
export function toOpenApi(spec: Spec, opts?: { only?: CodegenSlice }): unknown {
  const slice = resolveSlice(spec, opts?.only);
  // emit info/servers from spec; emit paths from slice.endpoints; emit components.schemas from slice.types
}
```

- [ ] **Step 5: Add slice tests for each generator**

`packages/core/tests/codegen/slice-output.test.ts` — quick sanity that passing `{ only: { endpointIds: ['getUser'] } }` produces output containing `User` and `Address` interfaces and **does not** mention `Company`. One test per generator (4 tests). Don't snapshot full output — too brittle.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test  # CLI passes no opts — must still produce identical output
pnpm --filter @zwaggen/core test
pnpm --filter web build
```

All green.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/codegen packages/core/src/exporters/openapi.ts packages/core/tests/codegen
git commit -m "$(cat <<'EOF'
feat(core/codegen): generators accept optional { only: CodegenSlice }

generateTs / generateZod / generateClient / toOpenApi now take an
optional opts arg with `only?: CodegenSlice`. When omitted, output
is identical to before (full spec). When provided, output is
filtered to the resolved slice (endpoints + transitive type closure).

Sets up the upcoming Export buttons (per-endpoint / per-type /
per-folder) and Live codegen preview panel in the web app.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Tick TODO + move spec/plan + final smoke

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

This slice doesn't tick any user-facing TODO line on its own (Slice 2 ticks the export entries). But the work is meaningful enough to log a follow-up entry under "Follow-up from shipped work".

- [ ] **Step 1: Update `docs/TODO.md`**

Add to the "Follow-up from shipped work" section:

```
- [x] Codegen library + slice API moved into `@zwaggen/core` — `generateTs` / `generateZod` / `generateClient` / `toOpenApi` accept `{ only?: CodegenSlice }`; `resolveSlice` walks transitive type closure for partial exports. CLI still works identically. Foundation for per-endpoint / per-type / per-folder Export buttons + Live codegen preview (Slice 2). See `docs/plans/done/2026-04-24-codegen-slice-api.md`.
```

Update "Last updated" stamp to `2026-04-24 (codegen-slice-api)`.

- [ ] **Step 2: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-24-codegen-slice-api.md docs/specs/done/
git mv docs/plans/active/2026-04-24-codegen-slice-api.md docs/plans/done/
```

- [ ] **Step 3: Final smoke**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship codegen-slice-api — log follow-up entry, move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All four codegen files moved into `packages/core/src/codegen/` (`types.ts` renamed to `ts.ts`).
- Helpers re-exported but not in `index.ts` public surface (only via `*` because they're tiny — acceptable; revisit if collisions appear).
- `resolveSlice` exists with full closure walking + extends parents + folderPrefix matching + unresolvedRefs surface.
- All four generators accept `{ only? }`; default = full spec.
- CLI behavior identical; `zwag generate ts` / `zwag generate zod` produce byte-identical output as before.
- 8 closure tests + 4 slice-output tests pass.
- All previously-existing tests pass (in their new home).
- `pnpm --filter web build` is green (web app still compiles against the new core surface).
- TODO follow-up entry added.
- Spec + plan moved to `done/`.
- Branch `plan/codegen-slice-api` ready to push.
