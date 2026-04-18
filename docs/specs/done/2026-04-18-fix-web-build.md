# Spec — Fix `pnpm --filter web build`

## Problem

`pnpm --filter web build` runs `tsc -b && vite build`. `tsc -b` currently fails with ~60 errors across 16 files. The playground Cloudflare Pages deploy routes around this via `build:vite` (skip typecheck, run vite only), but the normal `build` script should pass again so CI / local checks catch real regressions.

## Root causes

1. **`noUncheckedIndexedAccess: true`** (in `tsconfig.base.json`) — array/map indexing returns `T | undefined`. Lots of test code and `EndpointEditor.tsx` was written before this was enabled, and never tightened. Dominant error category (~45 of 60).
2. **vitest `Mock` generic signature changed** — `vi.fn<[Args], Return>()` is no longer valid; must be `vi.fn<(args: Args) => Return>()` or inferred. Affects `TypeBuilder.example.test.tsx` and (by cascade) `TypeBuilder.example.test.tsx` dependent assertions.
3. **`as const` on a runtime `null`** — `markdown.ts:38` writes `null as const`; TS 5.5 disallows this. Use `null` (the type is already `null` without the assertion).
4. **Missing export** — `tests/runner/buildRequest.test.ts` imports `Endpoint` from `src/runner/send.ts` which no longer re-exports it. Switch import to `src/schema/types`.
5. **Stale test fixtures** — a handful of test `Endpoint` literals are missing `useProxy` / `assertions: never[] vs Assertions` / `ParamDef.type` fields added by later features. Fill them in.
6. **Stale `ErrorKind` literal** — `history.test.ts:108` uses `'cors'`; the union is `'timeout' | 'cors-or-network' | 'other'`. Update to `'cors-or-network'`.
7. **`EndpointEditor.tsx` possibly-undefined `endpoint`** — inner functions (`patchAssertions`, `addHeaderRow`, etc.) reference `endpoint` from the outer closure. TS narrows `endpoint` to truthy after the early return, but narrowing does not carry into nested function declarations. Rewrite inner helpers to re-read the narrowed binding or convert to arrow consts defined after the guard (already the case structurally — the issue is TS still re-widens). Fix by hoisting a `const ep = endpoint;` right after the guard, or by asserting non-null with `!` at the call sites. Prefer the hoist.

## Success criteria

- `pnpm --filter web build` exits 0 on a clean `node_modules`.
- No test behavior changes — tests that previously passed still pass (`pnpm --filter web test`).
- No runtime changes — only type-level adjustments, fixture fills, and one `as const` removal.
- `apps/web/package.json` `build` script is unchanged (still `tsc -b && vite build`).

## Out of scope

- Fixing the React `act(...)` warnings (TODO item #1).
- Adjusting `noUncheckedIndexedAccess` — keep it on; fix the call sites.
- Broader refactors in `EndpointEditor.tsx` beyond the narrowing fix.
