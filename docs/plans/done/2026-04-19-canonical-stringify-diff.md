# Plan — Canonical stringify for schema/diff.ts type equality

Spec: `docs/specs/active/2026-04-19-canonical-stringify-diff.md`.

Execute on branch `plan/canonical-stringify-diff` in `.worktrees/canonical-stringify-diff`. All commits inside the worktree; never `cd` to the primary repo.

## Tasks

### 1. Add `canonicalStringify` helper + unit tests

**New file:** `apps/web/src/schema/canonical.ts`.

Contents:

```ts
export function canonicalStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : canonicalStringify(v))).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    if (typeof v === 'function' || typeof v === 'symbol') continue;
    parts.push(JSON.stringify(k) + ':' + canonicalStringify(v));
  }
  return '{' + parts.join(',') + '}';
}
```

**New test file:** `apps/web/tests/schema/canonical.test.ts`.

Cover:
- Primitives: `canonicalStringify(1) === '1'`, `canonicalStringify('x') === '"x"'`, `canonicalStringify(null) === 'null'`, `canonicalStringify(true) === 'true'`.
- Array order preserved: `canonicalStringify([2, 1]) === '[2,1]'`.
- Object keys sorted: `canonicalStringify({ b: 1, a: 2 }) === canonicalStringify({ a: 2, b: 1 })` and equals `'{"a":2,"b":1}'`.
- Nested: `canonicalStringify({ x: { b: 1, a: 2 } }) === canonicalStringify({ x: { a: 2, b: 1 } })`.
- Arrays of objects: `canonicalStringify([{ b: 1, a: 2 }]) === '[{"a":2,"b":1}]'`.
- Undefined property skipped: `canonicalStringify({ a: undefined, b: 1 }) === '{"b":1}'`.
- Realistic `TypeDef`-shaped: two identical `{ kind: 'string', minLength: 1, description: 'x' }` with keys in different order produce equal output.

### 2. Replace all six `JSON.stringify` equality checks in diff.ts

**File:** `apps/web/src/schema/diff.ts`.

Add at top:
```ts
import { canonicalStringify } from './canonical';
```

Replace:
- Line 86-87: `JSON.stringify(ea.tags ?? [])` → `canonicalStringify(ea.tags ?? [])` (both sides).
- Line 118: `JSON.stringify(aBody) !== JSON.stringify(bBody)` → `canonicalStringify(aBody) !== canonicalStringify(bBody)`.
- Line 151: `JSON.stringify(ra.type) !== JSON.stringify(rb.type)` → canonical version.
- Line 280: `JSON.stringify(fa.type) !== JSON.stringify(fb.type)` → canonical version.
- Line 292: `JSON.stringify(ta) !== JSON.stringify(tb)` → canonical version.
- Line 373: `JSON.stringify(pa.type) !== JSON.stringify(pb.type)` → canonical version.

Do not change diff semantics, categorisation, or the variable names for the tags case.

### 3. Add a regression test in diff.types.test.ts

**File:** `apps/web/tests/schema/diff.types.test.ts`.

Append a test demonstrating that two `TypeDef`s with identical contents but different property-insertion order are reported as equal. Sketch (adapt to existing test helpers and Spec constructors):

```ts
it('treats TypeDef property-order differences as equal', () => {
  const typeA: TypeDef = { kind: 'string', minLength: 1, description: 'x' };
  const typeB: TypeDef = { description: 'x', minLength: 1, kind: 'string' } as TypeDef;
  // both specs have a single endpoint whose response uses the type
  const specA = makeSpec({ /* ... type-using shape with typeA */ });
  const specB = makeSpec({ /* ... identical shape with typeB */ });
  const diff = diffSpecs(specA, specB);
  expect(diff.breaking).toHaveLength(0);
  expect(diff.nonBreaking.filter((c) => c.kind.includes('type.changed'))).toHaveLength(0);
});
```

Look at how the existing tests in the same file construct `Spec`/`Endpoint`/`TypeDef` fixtures and follow that pattern — do not invent new builders. If the cleanest way is a plain `diffTypeInPlace`-only test using types directly, that's fine too; use whatever matches the file's style.

### 4. Verify

Run:
```
pnpm --filter web test canonical
pnpm --filter web test diff
pnpm --filter web exec tsc -b
```
All pass, zero errors. `diff.endpoints.test.ts` and `diff.types.test.ts` still green.

### 5. Commit and archive

Single task commit:

```
feat(web): canonical stringify for schema/diff type equality

JSON.stringify preserves insertion order, so TypeDef values built by
different code paths (UI builder vs OpenAPI importer) can compare
unequal despite being structurally identical. canonicalStringify
sorts object keys while preserving array order, eliminating the
false-positive "type changed" diffs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Archive commit:

```
docs: tick canonical stringify TODO; archive spec + plan
```

Archive moves spec + plan from `active/` to `done/` and ticks the "Canonical stringify for `schema/diff.ts` type equality" line under "Follow-up from shipped work" in `docs/TODO.md` (`[ ]` → `[x]`), appending `— see docs/plans/done/2026-04-19-canonical-stringify-diff.md`. Bump `Last updated:` if needed.

## Execution strategy

One implementer subagent for tasks 1-4. One archive subagent for task 5.
