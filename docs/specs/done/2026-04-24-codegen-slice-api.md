# Spec — Codegen library + slice API (foundation for export buttons & live preview)

## Problem

`generateTs` / `generateZod` / `generateClient` live in `packages/cli/src/generate/`. The web app can't import them, so it can't:

1. Show a live codegen preview panel.
2. Power per-endpoint / per-type / per-folder Export buttons in EndpointEditor / TypeBuilder / TypePanel.

Each generator also takes a full `Spec` only — no slicing, no transitive type closure. Even if the web app could import them, "export this one endpoint" would need filtering logic the codegen doesn't expose.

This slice is the **foundation**: move the codegen into `@zwaggen/core` and add a slice API. Slice 2 (separate plan) consumes both for the UI surfaces.

## Success criteria

- `packages/cli/src/generate/{types,zod,client,helpers}.ts` move to `packages/core/src/codegen/`. `format.ts`, `watch.ts`, `index.ts` stay in CLI (Node-only deps + Commander wiring).
- New named exports from `@zwaggen/core`: `generateTs`, `generateZod`, `generateClient`, `resolveSlice`, plus the `CodegenSlice` / `ResolvedSlice` types.
- New helper `resolveSlice(spec, slice?: CodegenSlice): ResolvedSlice` that filters a spec into `{ endpoints, types }` honoring transitive type closure.
- `generateTs`, `generateZod`, `generateClient` gain an optional second arg `opts?: { only?: CodegenSlice }`. Default = full spec (current behavior).
- CLI `zwag generate ts` / `zwag generate zod` continue to work with no behavior change. They import from `@zwaggen/core` instead of relative paths.
- All existing codegen tests pass without modification (they test full-spec output — closure filter defaults to "everything").
- New tests for `resolveSlice`:
  - Single endpoint pulls its response types + param types transitively.
  - Single type pulls its `RefType` field references + its `extends` parents.
  - `folderPrefix: 'auth'` returns every type and endpoint whose `folder` starts with `auth/` or equals `auth`.
  - Combining `endpointIds + typeKeys + folderPrefix` unions the sets.
  - An endpoint that references a type that no longer exists in the spec (broken ref) is not silently dropped — surfaced as `unresolvedRefs: string[]` on the result.
- No public-facing UI changes. No new TODO follow-ups (slice 2 plan tracks the UI work).

## Out of scope

- The Export buttons themselves (Slice 2).
- The Live codegen preview panel (Slice 2).
- The 3-dot dropdown menu UX consolidation (Slice 2).
- A new CLI flag like `--only-folder` or `--only-endpoint` — the CLI doesn't need it yet; ship when there's a real ask.
- In-browser formatting (eslint/prettier). The web app will display raw codegen output for v1; format step is Node-only.
- Caching the codegen output — every call recomputes. The web app's preview panel will debounce in slice 2.

## Approach

### File moves (no logic change)

| From | To |
|------|----|
| `packages/cli/src/generate/types.ts` | `packages/core/src/codegen/types.ts` |
| `packages/cli/src/generate/zod.ts` | `packages/core/src/codegen/zod.ts` |
| `packages/cli/src/generate/client.ts` | `packages/core/src/codegen/client.ts` |
| `packages/cli/src/generate/helpers.ts` | `packages/core/src/codegen/helpers.ts` |

Internal imports inside those files (`from './helpers.js'`, `from './types.js'`) update to the new sibling paths. Imports from `@zwaggen/core` stay as-is — they're already pointing at the public surface.

`format.ts`, `watch.ts`, `index.ts` stay in `packages/cli/src/generate/`. `index.ts` updates its dynamic `import('./types.js')` calls to `import('@zwaggen/core')` (or static imports — see step 2).

### Codegen file naming collision

`packages/core/src/codegen/types.ts` would shadow `packages/core/src/schema/types.ts` if anyone glanced at the tree. Rename the new file to `packages/core/src/codegen/ts.ts` (the function inside is already `generateTs` — name matches). Same logic, just a less-confusing filename.

So:
- `packages/cli/src/generate/types.ts` → `packages/core/src/codegen/ts.ts`
- the rest keep their names

### `index.ts` re-export

Add to `packages/core/src/index.ts`:

```ts
export * from './codegen/ts';
export * from './codegen/zod';
export * from './codegen/client';
export * from './codegen/closure';
```

(Don't re-export `helpers.ts` — it's internal. The exported surface is just the four `generate*` functions plus `resolveSlice` + types.)

### `CodegenSlice` API

```ts
// packages/core/src/codegen/closure.ts

export interface CodegenSlice {
  /** Include only these endpoint IDs. */
  endpointIds?: string[];
  /** Include only these type keys (canonical, e.g. "auth/User" or "User"). */
  typeKeys?: string[];
  /**
   * Include every endpoint and type whose `folder` starts with this prefix
   * (canonical form, no leading/trailing slash). `'auth'` matches `'auth'`,
   * `'auth/oauth'`, but not `'authentication'`.
   */
  folderPrefix?: string;
}

export interface ResolvedSlice {
  endpoints: Endpoint[];
  types: TypeDef[];
  /**
   * Type keys referenced by the slice's endpoints / types but not present in
   * `spec.types`. Codegen callers can decide whether to fail loudly or emit
   * `unknown` placeholders.
   */
  unresolvedRefs: string[];
}

export function resolveSlice(spec: Spec, slice?: CodegenSlice): ResolvedSlice;
```

### Closure walking algorithm

1. **Initial endpoint set**:
   - If `slice` is `undefined` → all endpoints.
   - Otherwise: union of `endpointIds`, plus every endpoint whose `folder` matches `folderPrefix` (using `folderMatchesPrefix(endpoint.folder, folderPrefix)` — see helper below).

2. **Initial type set**:
   - If `slice` is `undefined` → all types.
   - Otherwise: union of `typeKeys`, plus every type whose key has a `folder` part matching `folderPrefix`.

3. **Walk endpoint dependencies**: for each endpoint in the initial set, walk its `pathParams`, `queryParams`, `headers`, `requestBody`, `bodyForm`, `responses[].type` and collect every `RefType.ref` encountered. Add those refs to a worklist.

4. **Walk type dependencies (transitive closure)**:
   - For every type added so far, walk its `fields[].type` (recursing into `ArrayType.items`, `UnionType.variants[]`, `ObjectType.fields[].type`) and collect every `RefType.ref`.
   - Also include every `extends` parent (recursively).
   - Add any newly-discovered refs to the type set.
   - Loop until the type set stops growing.

5. **Resolve refs to TypeDefs**: look up each ref in `spec.types`. Refs that don't resolve go into `unresolvedRefs`. Resolved ones are added to `result.types`.

6. **Order**:
   - `endpoints`: preserve `spec.endpoints` ordering, filtered.
   - `types`: preserve `spec.types` insertion order from the underlying `Map`, filtered. (Codegen already handles forward-references via hoisted interfaces, so topological sort isn't needed.)

### `folderMatchesPrefix` helper

```ts
// packages/core/src/codegen/closure.ts (or live in schema/folders.ts if it's reusable elsewhere)
export function folderMatchesPrefix(folder: string | undefined, prefix: string): boolean {
  if (!folder) return prefix === '';
  if (folder === prefix) return true;
  return folder.startsWith(prefix + '/');
}
```

`prefix === ''` matches "root" items (no `folder`). Empty prefix is unusual; document it. Slice 2's folder export buttons will only call this with non-empty prefixes.

### `generate*` signatures

Each generator changes from `(spec) => string` to `(spec, opts?) => string`:

```ts
export function generateTs(spec: Spec, opts?: { only?: CodegenSlice }): string {
  const slice = resolveSlice(spec, opts?.only);
  // existing body, but iterate `slice.endpoints` / `slice.types` instead of `spec.endpoints` / `spec.types`
}
```

Internally, where the current code does `for (const ep of spec.endpoints)` or `for (const [key, t] of spec.types)`, switch to using `slice.endpoints` and `slice.types`. Where `detectKeyCollisions(spec)` is called, change to `detectKeyCollisions(slice)` (after updating that helper to accept `{ endpoints, types }` instead of `Spec`).

The `slice.unresolvedRefs` are not surfaced in v1 — the codegen will emit `unknown` for unresolved refs the same way it does today. (Slice 2's Export popover can read `resolveSlice(...)` directly and warn the user.)

### `helpers.ts` move + `tagForEndpoint` reuse

`helpers.ts` exports `tagForEndpoint`, `safeIdentifier`, `sanitizeFolderKey`, `camelizeTag` — all pure. Move to `packages/core/src/codegen/helpers.ts`. Don't re-export from `index.ts` (internal).

### CLI updates

`packages/cli/src/generate/index.ts` currently has dynamic imports:

```ts
const { generateTs } = await import('./types.js');
```

Change to static imports from `@zwaggen/core`:

```ts
import { generateTs, generateZod, generateClient } from '@zwaggen/core';
```

(The dynamic-import dance was for tree-shaking the `--no-types` / `--no-schemas` flags, but the cost of always importing all three from core is ~20KB of pure JS — negligible at CLI startup. Simpler.)

`packages/cli/src/generate/format.ts` and `watch.ts` stay untouched.

### Tests

**Move existing tests** from `packages/cli/tests/generate/` → `packages/core/tests/codegen/` (the move follows the source). Update any internal import paths. Keep them as-is otherwise — no behavior change means no spec change.

**Add new test file** `packages/core/tests/codegen/closure.test.ts`:

```ts
describe('resolveSlice', () => {
  it('full spec when slice is undefined', () => { ... });
  it('endpointIds pulls only those endpoints + their type closure', () => { ... });
  it('typeKeys pulls only those types + transitive refs + extends parents', () => { ... });
  it('folderPrefix matches folder and subfolders, but not unrelated names', () => { ... });
  it('combining endpointIds + typeKeys + folderPrefix unions the sets', () => { ... });
  it('refs that do not resolve in spec.types appear in unresolvedRefs', () => { ... });
  it('preserves spec.endpoints and spec.types ordering', () => { ... });
});
```

**Smoke test the CLI** path stays green:
```bash
pnpm --filter @zwaggen/cli test
```

### Risks

- **Build graph change**: moving files into core means core gets a `codegen/` subtree it didn't have before. `tsc -b` should follow project references the same way; verify the web app's `pnpm --filter web build` still passes (the web app imports `@zwaggen/core`).
- **Test discovery**: `packages/core/vitest.config.ts` (or similar) might glob a specific path. Confirm `tests/codegen/` is included.
- **Circular imports**: `helpers.ts` imports `Endpoint` from `@zwaggen/core`. After the move, it'll be inside `@zwaggen/core`, importing from itself — change to a relative path like `from '../schema/types';`.
- **`detectKeyCollisions`** signature change: accepts `Spec` today. Change to accept `{ endpoints: Endpoint[]; types: TypeDef[] }` (compatible with both `Spec` and `ResolvedSlice`). Audit every call site.

## Done definition

- All four files moved + renamed (`types.ts` → `ts.ts`).
- `resolveSlice` exists with full closure walking + tests.
- `generateTs` / `generateZod` / `generateClient` accept `{ only? }`.
- All existing codegen tests pass.
- All new closure tests pass.
- CLI behavior unchanged (`zwag generate ts` / `zwag generate zod` still work).
- `pnpm --filter web build` and `pnpm --filter web test` still pass.
- Spec + plan moved to `done/`.
- Branch `plan/codegen-slice-api` pushed.
