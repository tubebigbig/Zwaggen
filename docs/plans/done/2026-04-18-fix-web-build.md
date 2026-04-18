# Plan — Fix `pnpm --filter web build`

Spec: `docs/specs/active/2026-04-18-fix-web-build.md`.

Execute on branch `plan/fix-web-build` in `.worktrees/fix-web-build`. All commits inside the worktree. One commit per task.

Baseline verification: `pnpm --filter web exec tsc -b` should exit 0 after the final task.

## Tasks

### 1. Hoist narrowed `endpoint` in `EndpointEditor.tsx`

**Files:** `apps/web/src/ui/EndpointEditor.tsx`

Right after the `if (!endpoint) return ...` guard (line 68–80), add `const ep = endpoint;` and replace all `endpoint.` references below that line with `ep.` — including inside nested function declarations (`patchAssertions`, `addHeaderRow`, `updateHeaderRow`, `removeHeaderRow`, `patchCaptures`, `addCapture`, `updateCapture`, `removeCapture`, `updateTags`, and any JSX using `endpoint`). The outer `endpoint` binding may still be referenced in the `spec.endpoints.map((e) => e.id === endpoint.id ? ...)` lambdas — those narrow fine, but switch them to `ep.id` too for consistency.

Verify: `pnpm --filter web exec tsc -b` should no longer list `EndpointEditor.tsx` errors.

Commit: `fix(web): hoist narrowed endpoint binding in EndpointEditor`.

### 2. Drop `as const` on null in `markdown.ts`

**Files:** `apps/web/src/exporters/markdown.ts:38`

Change `[null as const]` to `[null]`. The declared array type `(string | null)[]` accepts it.

Commit: `fix(web): drop invalid const assertion on null in markdown exporter`.

### 3. Port vitest `Mock` generics in `TypeBuilder.example.test.tsx`

**Files:** `apps/web/tests/ui/TypeBuilder.example.test.tsx`

Replace all `vi.fn<[TypeDef], void>()` with `vi.fn<(next: TypeDef) => void>()`. Three occurrences. This also fixes the cascading `lastArg` inference errors (lines 34, 51) because `spy.mock.calls[…][0]` becomes typed again — but those accesses are still `possibly undefined` under `noUncheckedIndexedAccess`, so add `!` after the index: `spy.mock.calls[spy.mock.calls.length - 1]![0]`. The line 72 destructure `([next]) => …` similarly needs `spy.mock.calls.filter` — if `next` shows as `never`, the generic fix alone resolves it.

Verify: `pnpm --filter web exec tsc -b` no longer lists `TypeBuilder.example.test.tsx`.

Commit: `fix(web): migrate vi.fn generics to function-type form`.

### 4. Fill missing fields in `Endpoint` test fixtures

**Files:**
- `apps/web/tests/state/store.history.test.ts:13` — add `useProxy: 'inherit'`.
- `apps/web/tests/ui/BatchRunPanel.test.tsx:16` — the fixture has `assertions: never[]` because the literal is `[]` and TS widens. Drop `assertions: []` (it's optional) OR cast via `satisfies Endpoint[]`. Prefer dropping the key.
- `apps/web/tests/ui/RunPanel.history.test.tsx:111` — add `type: 'string'` (or matching kind) to the `ParamDef` literal.
- `apps/web/tests/storage/history.test.ts:108` — change `'cors'` to `'cors-or-network'`.

Commit: `fix(web): update stale Endpoint/ParamDef/ErrorKind test fixtures`.

### 5. Fix import in `buildRequest.test.ts`

**Files:** `apps/web/tests/runner/buildRequest.test.ts:4`

Change `import { Endpoint } from '../../src/runner/send'` to `import type { Endpoint } from '../../src/schema/types'`. Verify the import form (`import type`) matches the file's convention.

Commit: `fix(web): import Endpoint from schema/types in buildRequest test`.

### 6. Fix `openapi.test.ts` conversion cast

**Files:** `apps/web/tests/importers/openapi.test.ts:357`

The offending line casts `TypeDef | undefined` to `Record<string, unknown>`. Per the error hint, go through `unknown`: `x as unknown as Record<string, unknown>`. Or, if the value is known non-null, assert first: `x!`. Inspect the surrounding code; pick the minimal form that keeps intent.

Commit: `fix(web): widen openapi importer test cast via unknown`.

### 7. Sweep remaining `Object is possibly 'undefined'` in tests

**Files (all in `apps/web/tests/`):**
- `importers/openapi.test.ts:411, 437, 438, 495, 527`
- `runner/assertions.test.ts:34, 35`
- `runner/batch.test.ts:84, 85`
- `runner/captures.test.ts:99, 100, 113, 114, 127, 128, 204, 205`
- `schema/serialize.test.ts:69 (×2), 93 (×2)`
- `storage/history.test.ts:51, 52, 63, 65`
- `ui/RunPanel.curl.test.tsx:33, 86, 148, 212`
- `ui/RunPanel.history.test.tsx:34, 111, 198 (`timeEl`)`
- `ui/RunPanel.secretsMissingVars.test.tsx:120`
- `ui/RunPanel.test.tsx:23, 33, 52`

These are all the same shape: `arr[0].foo` where `arr[0]` is now `T | undefined`. Fix with non-null assertion at the index: `arr[0]!.foo`. Tests assert on specific array contents; `!` expresses the invariant without changing behavior.

One exception: `RunPanel.history.test.tsx:198` — `timeEl` is probably a `queryByX` result; if the test asserts existence elsewhere, add `!` at use; otherwise switch `queryBy` → `getBy` (which throws on miss — cleaner). Inspect before touching.

Verify: `pnpm --filter web exec tsc -b` exits 0.

Commit: `fix(web): assert non-null on indexed test accesses under noUncheckedIndexedAccess`.

### 8. Verify build passes end-to-end

Run from the worktree:
```
pnpm --filter web build
pnpm --filter web test
```

Both must exit 0. If `vite build` surfaces anything new (it shouldn't — pure type-level changes), treat as a regression and fix in-place.

No commit needed unless fixes required.

### 9. Tick TODO + move spec/plan to `done/`

**Files:** `docs/TODO.md`, `docs/specs/active/2026-04-18-fix-web-build.md`, `docs/plans/active/2026-04-18-fix-web-build.md`.

- Tick item #2 in the Fix section of `docs/TODO.md`; amend the line to note the fix shipped.
- Move spec + plan from `active/` to `done/`.

Commit: `docs: tick web build fix TODO; archive spec + plan`.

## Subagent prompt skeleton

Each subagent gets: the spec + plan paths, the specific task ID to execute, the rule that all git operations run inside `.worktrees/fix-web-build` on branch `plan/fix-web-build` — never `cd` to the primary repo. Final trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
