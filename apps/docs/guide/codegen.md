# Codegen

Zwaggen specs are the **single source of truth** for your API contract. Codegen turns a `.zwag` spec into TypeScript types, Zod runtime validators, and a typed client your frontend can call directly — no more hand-typing interfaces from Swagger by eye, no manual sync ritual when the contract changes.

## Install

The `zwag` CLI ships with codegen built in. Install via npm/pnpm/bun:

```bash
pnpm add -D @zwaggen/cli zod
# or
npm install -D @zwaggen/cli zod
# or
bun add -d @zwaggen/cli zod
```

`zod` is a peer dependency — the generated `schemas.ts` imports from it.

## Quick start

Given a spec at `./api.zwag` (the file you save from Zwaggen Web):

```bash
zwag generate ts ./api.zwag --out ./src/generated --client
```

This writes three files into `./src/generated/`:

- `types.ts` — pure TypeScript interfaces and type aliases for every Type in the spec
- `schemas.ts` — Zod schemas (`UserSchema`, `AdminSchema`, …) for runtime validation
- `client.ts` — a typed client object you instantiate against your API base URL

## Using the generated client

```typescript
import { createClient } from './generated/client';

const api = createClient({
  baseUrl: 'https://api.example.com',
  headers: () => ({ authorization: `Bearer ${getToken()}` }),
});

const users = await api.users.listUsers();      // typed: Promise<User[]>
const me    = await api.users.getUser({ id: 'u1' });
const made  = await api.users.createUser({ body: { id: 'u9', name: 'New' } });
```

Every response is validated through its Zod schema — if the API drifts and returns the wrong shape, you get a clear runtime error at the call site instead of a mysterious `undefined` deeper in your component tree.

## Watch mode

During development, run codegen in the background. It debounces and re-runs on every save:

```bash
zwag generate ts ./api.zwag --out ./src/generated --client --watch
```

Add it to your `dev` script:

```json
{
  "scripts": {
    "codegen": "zwag generate ts ./api.zwag --out ./src/generated --client",
    "codegen:watch": "zwag generate ts ./api.zwag --out ./src/generated --client --watch",
    "dev": "concurrently 'pnpm codegen:watch' 'vite'"
  }
}
```

## Schemas-only mode

If you only want runtime validators (e.g., your TS types come from somewhere else):

```bash
zwag generate zod ./api.zwag --out ./src/generated
```

This emits only `schemas.ts`.

## Universal runtime

Generated code uses only `globalThis.fetch`, `URL`, `JSON`, and `zod`. It runs unchanged in:

- Browsers (modern evergreen)
- Node.js ≥ 18
- Deno
- Bun
- React Native (with a fetch polyfill if your target is below RN 0.71)

There are no Node-specific imports in the generated output. Your bundler (Vite, esbuild, webpack, Rollup, …) handles the rest.

## Should I commit the generated files?

Two patterns work; pick the one that fits your team:

**Pattern A — commit them.** PRs show meaningful diffs when the contract changes. CI just runs `tsc`. Reviewers see exactly what changed type-wise.

**Pattern B — `.gitignore` them and regenerate in CI.** Keeps the repo lean. Add `pnpm codegen` to your CI's prebuild step. The trade-off: PRs don't show the type changes inline, and you need a clean spec → code pipeline.

Pattern A is more common for product teams; pattern B is more common for libraries.

## Determinism

Generated output is deterministic — same spec → byte-identical files across machines, OSes, and runs. Safe to commit, safe to compare in CI, safe to review in PRs.

## Output flags

```
zwag generate ts <spec> [options]

  --out <dir>      Output directory (default: ./zwaggen-generated)
  --client         Also emit client.ts (typed client object)
  --no-types       Skip types.ts
  --no-schemas     Skip schemas.ts
  --watch          Re-run on spec change (200ms debounce)

zwag generate zod <spec> [options]

  --out <dir>      Output directory (default: ./zwaggen-generated)
  --watch          Re-run on spec change
```

## What about backend?

Backend frameworks already eat OpenAPI. Use `zwag` to export an OpenAPI 3 document from your spec, then point your existing backend codegen (NestJS, FastAPI, openapi-generator, oazapfts, …) at it. The contract stays the same; backend and frontend converge from the same `.zwag` file.

## Troubleshooting

**"Cannot find module 'zod'"** — `pnpm add -D zod` (or your package manager equivalent) in the project that consumes the generated code.

**"Property X does not exist on type Y"** — your spec doesn't define field X. Open the spec, add the field, regenerate.

**Tests pass but the live API returns the wrong shape** — that's drift. The generated Zod parse will throw with a precise path to the mismatched field. Fix the API or update the spec; either way the contract was wrong.
