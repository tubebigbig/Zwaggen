# Dedupe `apps/web` ↔ `@zwaggen/core` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make `@zwaggen/core` the single source of truth for schema + runner modules. Delete the duplicate copies under `apps/web/src/schema/` and `apps/web/src/runner/` and update every import in `apps/web` to point at `@zwaggen/core`.

**Architecture:** Copy the two folder-new files (`schema/folders.ts`, `schema/groupByFolder.ts`) and the drifted files (`schema/rename.ts`, `schema/serialize.ts`) from web to core, update core's barrel, add core as a workspace dep of web, rewrite ~45 import sites, delete the duplicates. `runner/batch.ts` stays in web because it depends on IDB-backed storage; its schema+runner imports also switch to `@zwaggen/core`. No behavioral changes — this is a pure refactor.

**Tech Stack:** TypeScript, pnpm workspaces, tsup (core build), Vitest, Playwright.

**Pre-work scope audit (for the implementer):**
- Byte-identical files: `canonical.ts`, `defaults.ts`, `diff.ts`, `groupByTag.ts`, `resolveExample.ts`, `types.ts` (schema); `assertions.ts`, `auth.ts`, `captures.ts`, `classify-error.ts`, `curl.ts`, `path.ts`, `send.ts`, `substitute.ts` (runner). Confirm with `diff -q` before moving.
- Drifted files: `schema/rename.ts` (web has `renameFolder` + `childOf` re-export), `schema/serialize.ts` (web has the v1→v2 upgrade branch documented slightly differently).
- Core-missing files: `schema/folders.ts`, `schema/groupByFolder.ts`.
- Web-only: `runner/batch.ts`. Stays in web; its imports will be rewritten in Task 3.
- Import count: 45 across 26 files under `apps/web/src`.

---

## Task 1: Sync core with web's schema layer

**Files:**
- Copy: `apps/web/src/schema/folders.ts` → `packages/core/src/schema/folders.ts`
- Copy: `apps/web/src/schema/groupByFolder.ts` → `packages/core/src/schema/groupByFolder.ts`
- Copy (overwriting): `apps/web/src/schema/rename.ts` → `packages/core/src/schema/rename.ts`
- Copy (overwriting): `apps/web/src/schema/serialize.ts` → `packages/core/src/schema/serialize.ts`
- Modify: `packages/core/src/index.ts` (barrel) — add folders + groupByFolder exports.

- [ ] **Step 1: Copy the new + drifted files**

Run (from inside the worktree at `.worktrees/dedupe-web-core`):
```bash
cp apps/web/src/schema/folders.ts packages/core/src/schema/folders.ts
cp apps/web/src/schema/groupByFolder.ts packages/core/src/schema/groupByFolder.ts
cp apps/web/src/schema/rename.ts packages/core/src/schema/rename.ts
cp apps/web/src/schema/serialize.ts packages/core/src/schema/serialize.ts
```

Verify byte-identity of the four remaining files (no-op expected):
```bash
for f in canonical.ts defaults.ts diff.ts groupByTag.ts resolveExample.ts types.ts; do
  diff -q apps/web/src/schema/$f packages/core/src/schema/$f && echo "ok: $f" || echo "DRIFT: $f"
done
```
Expected output: `ok: canonical.ts`, `ok: defaults.ts`, `ok: diff.ts`, `ok: groupByTag.ts`, `ok: resolveExample.ts`, `ok: types.ts`.

- [ ] **Step 2: Update `packages/core/src/index.ts` barrel**

Add two new export lines so the barrel includes the folder utilities:

```ts
export * from './schema/folders';
export * from './schema/groupByFolder';
```

Place them between `./schema/diff` and `./schema/groupByTag` (alphabetical within each section is nice; this places folders+groupByFolder adjacent to groupByTag). Preserve the rest of the file.

- [ ] **Step 3: Run core tests + lint**

```bash
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/core lint
```

Expected: all core tests pass (likely including any pre-existing rename/serialize/folders tests once they carry over — but the web test suite for these files stays in web for now; we'll address missing test coverage in Task 5 sweep). Lint clean.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/schema/folders.ts packages/core/src/schema/groupByFolder.ts packages/core/src/schema/rename.ts packages/core/src/schema/serialize.ts packages/core/src/index.ts
git commit -m "refactor(core): sync schema layer with apps/web (folders, rename, serialize)" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `@zwaggen/core` as a workspace dep of `apps/web`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the dep**

Edit `apps/web/package.json` and add to `dependencies` (alphabetical or existing order — doesn't matter):

```json
    "@zwaggen/core": "workspace:*",
```

- [ ] **Step 2: Install**

Run from repo root: `pnpm install`

Expected: pnpm creates a symlink in `apps/web/node_modules/@zwaggen/core` pointing at `packages/core`.

- [ ] **Step 3: Build core so web can import the compiled `.d.ts`**

```bash
pnpm --filter @zwaggen/core build
```

Expected: `packages/core/dist/index.js` and `dist/index.d.ts` exist. Confirm with `ls packages/core/dist/`.

- [ ] **Step 4: Smoke-check web can resolve core imports**

Run `pnpm --filter @zwaggen/web lint` — expect it to still pass (no imports yet; just confirming the dep resolution didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @zwaggen/core as a workspace dependency" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Rewrite all imports in `apps/web/src` to use `@zwaggen/core`

**Files:** ~26 files across `apps/web/src`. See the scope audit at the top of this plan.

Every line that imports from `../schema/<X>` or `../runner/<X>` (where `<X>` is one of the shared modules, NOT `../runner/batch`) changes to `from '@zwaggen/core'`.

- [ ] **Step 1: Enumerate the imports**

Run:
```bash
grep -rn "from ['\"]\\.\\./\\+schema/\\|from ['\"]\\.\\./\\+runner/" apps/web/src | grep -v "runner/batch"
```

Save the output — this is your worklist. Expect ~44 hits (the 45th hit is a batch.ts-internal import of `./send` which we'll handle separately in this task since batch.ts stays in web but its imports must still move to core).

- [ ] **Step 2: Rewrite imports**

For each hit, rewrite the `from` clause to point at `@zwaggen/core`. Collapse multiple `../schema` / `../runner` imports in the same file into a single `@zwaggen/core` import where possible. Example transforms:

Before:
```ts
import type { Spec } from '../schema/types';
import { emptySpec } from '../schema/defaults';
import { sendRequest } from '../runner/send';
```

After:
```ts
import { type Spec, emptySpec, sendRequest } from '@zwaggen/core';
```

Pure type imports stay as `import type { X }`. Mixed imports use the `type` inline-modifier pattern (`import { type Spec, emptySpec } from '@zwaggen/core'`).

**Important edge cases:**
- `apps/web/src/runner/batch.ts`: its imports from `./send`, `./assertions`, `../schema/types`, etc. all become `@zwaggen/core`. The two web-only imports (`../storage/history`, `../storage/drafts`, `../validator/validate`) stay as relative paths.
- `apps/web/src/runner/captures.ts`, `auth.ts`, `send.ts`, `assertions.ts`, `classify-error.ts`, `curl.ts`, `path.ts`, `substitute.ts`: these are going to be **deleted in Task 4**. Don't edit their imports — Task 4 removes them entirely.
- `apps/web/src/schema/*` files: these are also going to be deleted. Don't edit their imports.

So the actual import-rewrite scope in this task is: every NON-schema-non-runner file under `apps/web/src/` plus `apps/web/src/runner/batch.ts`.

- [ ] **Step 3: Run typecheck after rewrites**

```bash
pnpm --filter @zwaggen/web lint
```

Expected: clean. If you see errors about missing exports from `@zwaggen/core`, check that the barrel (`packages/core/src/index.ts`) re-exports them and that core was rebuilt (`pnpm --filter @zwaggen/core build`).

- [ ] **Step 4: Run full tests**

```bash
pnpm --filter @zwaggen/web test
```

Expected: 440/440 still pass. Web's tests that import from `../schema/X` or `../runner/X` will continue to resolve to the web-local copies until Task 4 deletes them — that's intentional, so Task 3 is a no-op at runtime (the imports still point at valid paths either way). This task just routes NEW imports through core so Task 4's deletion is safe.

Wait — that's not quite right. **Tests under `apps/web/tests` also import from `../../src/schema/X`.** These imports break the moment Task 4 deletes the files. Handle in Task 4 OR rewrite the test imports in this task too. **Recommended:** include test-file imports in this task's rewrite scope so Task 4 is a clean delete. Expand the grep to cover `apps/web/tests` too:

```bash
grep -rn "from ['\"]\\.\\.\\.\\+/src/schema/\\|from ['\"]\\.\\.\\.\\+/src/runner/" apps/web/tests | grep -v "runner/batch"
```

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "refactor(web): route schema + runner imports through @zwaggen/core" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Delete the duplicated files under `apps/web/src/schema/` and `apps/web/src/runner/`

**Files (all deleted except where noted):**

Schema dir — all 10 files deleted:
- `apps/web/src/schema/canonical.ts`
- `apps/web/src/schema/defaults.ts`
- `apps/web/src/schema/diff.ts`
- `apps/web/src/schema/folders.ts`
- `apps/web/src/schema/groupByFolder.ts`
- `apps/web/src/schema/groupByTag.ts`
- `apps/web/src/schema/rename.ts`
- `apps/web/src/schema/resolveExample.ts`
- `apps/web/src/schema/serialize.ts`
- `apps/web/src/schema/types.ts`

After deletion the `apps/web/src/schema/` directory should be empty — `rmdir` it.

Runner dir — 8 of 9 files deleted, `batch.ts` stays:
- `apps/web/src/runner/assertions.ts` (delete)
- `apps/web/src/runner/auth.ts` (delete)
- `apps/web/src/runner/captures.ts` (delete)
- `apps/web/src/runner/classify-error.ts` (delete)
- `apps/web/src/runner/curl.ts` (delete)
- `apps/web/src/runner/path.ts` (delete)
- `apps/web/src/runner/send.ts` (delete)
- `apps/web/src/runner/substitute.ts` (delete)
- `apps/web/src/runner/batch.ts` (**KEEP**)

Tests dir — web's duplicated schema+runner tests must also be removed since the source they test is gone. The equivalent tests already live in `packages/core/tests/`. Confirm parity before deleting:

- Delete: `apps/web/tests/schema/*.test.ts` (all — `canonical`, `diff.*`, `groupByTag`, `rename`, `resolveExample`, `secrets`, `serialize`, `usageIndex` — AND the folder-new `folders.test.ts` and `groupByFolder.test.ts`).
- Delete: `apps/web/tests/runner/*.test.ts` (auth, captures, classify-error).
- **KEEP:** any test that tests batch.ts OR tests a web-only consumer (e.g., `apps/web/tests/runner/batch.test.tsx` if it exists, or anything importing from `src/ui/`, `src/storage/`, `src/validator/`, `src/exporters/`, `src/importers/`).

Before deleting, verify core has parity tests. Run:
```bash
ls packages/core/tests/schema/ packages/core/tests/runner/
```
Expected: mirrors of every apps/web/tests/schema + runner test being deleted, except folders.test.ts + groupByFolder.test.ts (which are new — Task 1 copied the source but didn't copy the tests). As part of this task, ALSO copy those two tests to core.

- [ ] **Step 1: Copy folders + groupByFolder tests to core**

```bash
cp apps/web/tests/schema/folders.test.ts packages/core/tests/schema/folders.test.ts
cp apps/web/tests/schema/groupByFolder.test.ts packages/core/tests/schema/groupByFolder.test.ts
```

- [ ] **Step 2: Delete the duplicated sources under `apps/web/src/schema/`**

```bash
rm -f apps/web/src/schema/*.ts
rmdir apps/web/src/schema
```

- [ ] **Step 3: Delete the duplicated sources under `apps/web/src/runner/` except batch.ts**

```bash
rm apps/web/src/runner/assertions.ts apps/web/src/runner/auth.ts apps/web/src/runner/captures.ts apps/web/src/runner/classify-error.ts apps/web/src/runner/curl.ts apps/web/src/runner/path.ts apps/web/src/runner/send.ts apps/web/src/runner/substitute.ts
```

- [ ] **Step 4: Delete the duplicated tests**

```bash
rm -f apps/web/tests/schema/*.test.ts
rmdir apps/web/tests/schema
rm -f apps/web/tests/runner/auth.test.ts apps/web/tests/runner/captures.test.ts apps/web/tests/runner/classify-error.test.ts
```

(Keep `apps/web/tests/runner/batch.test.tsx` if it exists — it tests web-specific behavior.)

- [ ] **Step 5: Run full workspace test + lint**

```bash
pnpm --filter @zwaggen/core test   # all core tests incl. 2 new folder tests
pnpm --filter @zwaggen/core lint
pnpm --filter @zwaggen/web test    # web tests, minus the deleted ones
pnpm --filter @zwaggen/web lint
pnpm --filter @zwaggen/cli test    # regression check — CLI imports core
pnpm --filter @zwaggen/cli lint
```

All should pass.

- [ ] **Step 6: Run the Playwright e2e as a final regression**

```bash
pnpm --filter @zwaggen/web e2e
```

Expected: all 5 responsive tests + 2 folders tests still green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(web): delete duplicated schema + runner now that @zwaggen/core owns them" -m "" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Ship checklist (after Task 4 lands)

1. `git log main..HEAD --oneline` — expect 4 clean commits.
2. `pnpm -r test && pnpm -r lint` — full workspace green.
3. Move the plan to `docs/plans/done/` and tick the TODO entry (the existing line says "~82 import sites" — leave the historical note, just mark the checkbox):

```markdown
- [x] Deduplicate apps/web + @zwaggen/core — migrated apps/web to import from @zwaggen/core and deleted the duplicates. See `docs/plans/done/2026-04-20-dedupe-web-core.md`.
```

4. Push branch to origin. User FF-merges and deletes the branch as with the folders feature.
