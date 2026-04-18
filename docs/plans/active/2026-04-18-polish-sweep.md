# Polish sweep — Implementation Plan

**Spec:** `docs/specs/active/2026-04-18-polish-sweep.md`

**Goal:** Three small follow-ups from prior code reviews in one plan.

**Architecture:** Each task is isolated; no shared state. One commit per task.

---

## Tasks

### Task 1: `collectMissingVars` learns about secrets

**Files:**
- Modify: `apps/web/src/ui/RunPanel.tsx`
- Create: `apps/web/tests/ui/RunPanel.secretsMissingVars.test.tsx`

- [ ] Add a `const secretsSnapshot = useRef<Record<string, string>>({})` inside `RunPanel`.
- [ ] Add a `useEffect` keyed on `[spec.activeEnvironment]` that loads secrets via `loadSecrets()` and stores `store[spec.activeEnvironment] ?? {}` into `secretsSnapshot.current`. Also trigger on `spec.environments[activeEnvironment]` changes if that's cheap; otherwise just active-env is fine.
- [ ] In `collectMissingVars`, replace the `known` builder with:
  ```ts
  const known: Record<string, string> = {};
  if (env) {
    for (const v of env.variables) {
      if (v.secret) {
        const fromIdb = secretsSnapshot.current[v.name];
        if (v.value) known[v.name] = v.value;
        else if (fromIdb) known[v.name] = fromIdb;
        // else: truly missing, leave out
      } else {
        known[v.name] = v.value;
      }
    }
  }
  ```
- [ ] Tests (new file). Seed store with an env that has a secret `TOKEN`. Stub `window.confirm`. Mock `fetch`. Three cases per spec's Testing section.
- [ ] Commit: `fix(web): missing-vars dialog no longer fires for filled secrets`.

### Task 2: Drop `IconChevron` in favor of `IconChevronDown`

**Files:**
- Modify: `apps/web/src/ui/ExportMenu.tsx`
- Modify: `apps/web/src/ui/icons.tsx`

- [ ] In `ExportMenu.tsx`: change `import { IconChevron, IconDownload } from './icons'` → `import { IconChevronDown, IconDownload } from './icons'`. Replace the `<IconChevron ... />` usage with `<IconChevronDown ... />`. Preserve the existing `className="-mr-0.5 text-slate-400 transition group-open:rotate-180"`.
- [ ] In `icons.tsx`: delete the `IconChevron` export (the one at line 44).
- [ ] Grep-check: `grep -r IconChevron\\b apps/web/src` should show only `IconChevronLeft`, `IconChevronRight`, `IconChevronDown` — NO bare `IconChevron`.
- [ ] Full suite green (no test imports the old name).
- [ ] Commit: `refactor(icons): consolidate IconChevron into IconChevronDown`.

### Task 3: `readAllOf` preserves `description` and `strict`

**Files:**
- Modify: `apps/web/src/importers/openapi.ts`
- Modify: `apps/web/tests/importers/openapi.test.ts`

- [ ] At the bottom of `readAllOf`, after `fields` is assembled, compute `firstDesc` (first non-empty `description` from object parts in order) and `anyStrict` (any object part has `strict: true`). Return `{ kind: 'object', fields, ...(firstDesc ? { description: firstDesc } : {}), ...(anyStrict ? { strict: true } : {}) }`.
- [ ] Tests (3 new cases in the existing `allOf` / edge-cases describe block):
  - `allOf` with two objects each having a `description` → merged takes the first.
  - `allOf` with one object `additionalProperties: false` → merged has `strict: true`.
  - `allOf` with no `description` / `strict` on any part → merged has `'description' in merged === false` and `'strict' in merged === false`.
- [ ] Commit: `feat(importers): preserve description + strict through allOf merge`.

### Task 4: e2e + docs move

- [ ] `pnpm e2e` green.
- [ ] `git mv` the spec + plan to their `done/` counterparts. Commit.

---

## Open Questions

None.
