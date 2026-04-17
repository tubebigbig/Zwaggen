# Type delete guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent deleting a named type while any endpoint or any other type still references it. Surface the list of usage sites under the type-name input and make each entry clickable so the user can jump to the reference, remove it, then return to delete the type.

**Spec:** `docs/specs/active/2026-04-17-type-delete-guard-design.md`

**Architecture:** A single new pure function in the schema layer — `buildUsageIndex(spec)` — returns `Record<typeName, Usage[]>` in one pass over `spec.types` and `spec.endpoints`. `TypePanel` consumes it via `useMemo`, disables the trash icon when the selected type has usages, and renders a "Referenced by" list whose items dispatch either `selectEndpoint` (existing store action) or `setSelected` (panel-local state). No schema changes, no new store slices, no new I/O. The existing broken-ref alert and Save-time block are untouched — this feature is strictly *preventive*, those remain *reactive* safety nets for specs loaded from disk.

**Tech Stack:** existing stack only — no new dependencies.

---

## Rules Applied
No new rules. `spec-versioning` is not affected (no schema change). `validator-cycles` is not affected (no validator change). The `walk` helper in `schema/rename.ts` already terminates on cycles because it does not follow `ref` nodes — this plan reuses it as-is.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/schema/rename.ts` | Add `Usage` type and `buildUsageIndex` export alongside existing `walk`, `renameType`, `collectBrokenRefs` |
| Modify | `apps/web/src/ui/TypePanel.tsx` | Compute usage index, disable trash with tooltip, render "Referenced by" list, guard `remove()` |
| Create | `apps/web/tests/schema/usageIndex.test.ts` | Unit tests for `buildUsageIndex` |
| Create | `apps/web/tests/ui/TypePanel.usageGuard.test.tsx` | Component tests for the disabled-trash + click-to-jump behavior |

Everything else — `collectBrokenRefs`, `renameType`, `AppHeader.saveSpec`, the broken-ref alert rendering — stays as-is.

---

## Tasks

### Task 1: `buildUsageIndex` in schema layer

**Files:**
- Modify: `apps/web/src/schema/rename.ts`
- Create: `apps/web/tests/schema/usageIndex.test.ts`

**Acceptance criteria covered:** spec requirements 1, 2 (self-refs ignored), and the label format under "Design → Schema layer".

- [ ] **Step 1: Define the `Usage` shape**

Add these exports to `apps/web/src/schema/rename.ts`:

```ts
export type Usage =
  | { kind: 'endpoint'; endpointId: string; label: string }
  | { kind: 'type'; typeName: string; label: string };
```

- [ ] **Step 2: Implement `buildUsageIndex`**

Single pass that mirrors `collectBrokenRefs`' traversal order, but:
- Keys the map by the *referenced* type name (not the location).
- Threads a `containingTypeName` string through the type-table walk so self-refs are dropped before they enter the index.
- Emits human-readable labels per the spec.

```ts
export function buildUsageIndex(spec: Spec): Record<string, Usage[]> {
  const out: Record<string, Usage[]> = {};
  const push = (name: string, u: Usage) => {
    (out[name] ??= []).push(u);
  };

  const visit = (t: TypeDef, onRef: (refName: string) => void) => {
    walk(t, (sub) => {
      if (sub.kind === 'ref') onRef(sub.ref);
      return sub;
    });
  };

  // Types — skip self-refs while walking each type's body.
  for (const [containing, t] of Object.entries(spec.types)) {
    visit(t, (refName) => {
      if (refName === containing) return;
      push(refName, { kind: 'type', typeName: containing, label: containing });
    });
  }

  // Endpoints — one Usage per occurrence, with section-qualified labels.
  for (const e of spec.endpoints) {
    const base = `${e.method} ${e.path}`;
    const section = (s: string) =>
      push.bind(null) as never; // placeholder; use closures below
    const add = (refName: string, sectionLabel: string) =>
      push(refName, {
        kind: 'endpoint',
        endpointId: e.id,
        label: `${base} · ${sectionLabel}`,
      });

    if (e.requestBody) visit(e.requestBody, (r) => add(r, 'requestBody'));
    e.pathParams.forEach((p, i) => visit(p.type, (r) => add(r, `pathParams[${i}]`)));
    e.queryParams.forEach((p, i) => visit(p.type, (r) => add(r, `queryParams[${i}]`)));
    e.headers.forEach((p, i) => visit(p.type, (r) => add(r, `headers[${i}]`)));
    e.responses.forEach((r, i) => visit(r.type, (rf) => add(rf, `responses[${i}]`)));
  }

  return out;
}
```

Notes:
- The intermediate `section` placeholder above is illustrative — the real implementation only uses `add`. Drop the placeholder line.
- `walk` does not recurse into `ref` nodes, so there is no cycle risk here.
- Order within `out[name]`: all occurrences from `spec.types` first (insertion order), then endpoints in `spec.endpoints` order, each endpoint's sections in the listed order. This is deterministic for snapshot tests.

- [ ] **Step 3: Unit tests** — `apps/web/tests/schema/usageIndex.test.ts`

Cover every branch the spec calls out:

```ts
import { describe, it, expect } from 'vitest';
import { buildUsageIndex } from '../../src/schema/rename';
import type { Spec, TypeDef } from '../../src/schema/types';
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/types';

const ref = (name: string): TypeDef => ({ kind: 'ref', ref: name });
const obj = (fields: { name: string; type: TypeDef; required?: boolean }[]): TypeDef => ({
  kind: 'object',
  fields: fields.map((f) => ({ name: f.name, type: f.type, required: f.required ?? true })),
});

function makeSpec(partial: Partial<Spec>): Spec {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    info: { name: 'test' },
    types: {},
    environments: { default: { variables: [] } },
    activeEnvironment: 'default',
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [],
    ...partial,
  };
}
```

Required cases:
- **Endpoint — requestBody**: spec with one endpoint whose `requestBody` is `ref('User')`. Index has `User → [{ kind:'endpoint', endpointId, label:'POST /users · requestBody' }]`.
- **Endpoint — each param section**: one case per `pathParams[i]` / `queryParams[i]` / `headers[i]` / `responses[i]`, verifying the bracketed index in the label matches the position.
- **Type → type**: type `Account` has a field with `ref('User')`. Index has `User → [{ kind:'type', typeName:'Account', label:'Account' }]`.
- **Nested containers**: `ref('User')` inside an array element / inside a union variant / inside a nested object field — each produces exactly one `Usage` entry.
- **Self-ref dropped**: type `Tree` with a field `{ kind:'array', element: ref('Tree') }`. Index has no entry for `Tree`.
- **Unused type**: type `Ghost` has no references anywhere. `index['Ghost']` is `undefined` (the UI reads with `?? []`).
- **Multiple references, deterministic order**: `User` referenced from two endpoints and one type. Entries appear in the declared order (type first, endpoints in spec order).

Run: `pnpm --filter web test -- usageIndex`.

- [ ] **Step 4: Verify existing schema tests still pass**

`pnpm --filter web test -- schema` should stay green. No symbol renames, only additions.

---

### Task 2: Wire `TypePanel` to the usage index

**Files:**
- Modify: `apps/web/src/ui/TypePanel.tsx`
- Create: `apps/web/tests/ui/TypePanel.usageGuard.test.tsx`

**Acceptance criteria covered:** spec requirements 1, 3, 4, 5, 6. Requirement 7 (existing alert + save block) is verified by not touching that code.

- [ ] **Step 1: Compute the index**

Near the top of the component, after `const broken = collectBrokenRefs(spec);`:

```ts
const usageIndex = useMemo(() => buildUsageIndex(spec), [spec]);
const usages = selected ? usageIndex[selected] ?? [] : [];
```

Also pull `selectEndpoint` from the store:

```ts
const { spec, setSpec, selectEndpoint } = useSpecStore();
```

Add imports for `useMemo` and `buildUsageIndex`.

- [ ] **Step 2: Guard `remove()`**

```ts
async function remove(name: string) {
  if ((usageIndex[name] ?? []).length > 0) return;
  const { [name]: _, ...rest } = spec.types;
  await setSpec({ ...spec, types: rest });
  if (selected === name) setSelected(Object.keys(rest)[0] ?? null);
}
```

The defensive check reads from `usageIndex[name]` (not the closure's `usages`) so it is correct even if called for a non-selected type in the future.

- [ ] **Step 3: Disable the trash button with a tooltip**

Replace the trash button block (currently around lines 148–155 of `TypePanel.tsx`):

```tsx
<button
  className="btn-icon text-red-600 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
  aria-label="delete"
  title={
    usages.length > 0
      ? t('deleteTypeBlocked', { count: usages.length })
      : t('deleteType')
  }
  disabled={usages.length > 0}
  onClick={() => void remove(selected)}
>
  <IconTrash />
</button>
```

Add two i18n keys:
- `deleteTypeBlocked`: `"In use by {{count}} reference(s) — remove those first"`
- (`deleteType` already exists).

Add the key to both `en.json` and `zh-TW.json` to stay consistent with the in-flight i18n work.

- [ ] **Step 4: Render the "Referenced by" list**

Insert **between** the type-name input row and the `TypeBuilder` (i.e., inside `selected && current &&` block, after the `<div className="flex gap-2">` that holds the input + trash, before `<TypeBuilder ... />`):

```tsx
{usages.length > 0 && (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
    <div className="mb-1 font-medium text-slate-600">
      {t('referencedBy', { count: usages.length })}
    </div>
    <ul className="space-y-0.5">
      {usages.map((u, i) => (
        <li key={i}>
          <button
            className="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] text-slate-700 hover:bg-white hover:text-brand-700"
            onClick={() => {
              if (u.kind === 'endpoint') {
                selectEndpoint(u.endpointId);
                setUiPref('typesCollapsed', true);
              } else {
                setSelected(u.typeName);
              }
            }}
          >
            {u.label}
          </button>
        </li>
      ))}
    </ul>
  </div>
)}
```

i18n key: `referencedBy`: `"Referenced by {{count}}"`.

Visual notes:
- Reuses the existing `bg-slate-50` / `border-slate-200` / `text-slate-*` palette. No new tokens.
- The list sits *above* `TypeBuilder`, matching the spec.

- [ ] **Step 5: Component tests** — `apps/web/tests/ui/TypePanel.usageGuard.test.tsx`

Use `TypePanel.test.tsx` as a starting point for store setup. Required cases:

1. **Unused type — trash enabled, no list.**
   - Seed store with one type `T` and no endpoints.
   - Assert trash button is not disabled and `referencedBy` text is absent.
2. **Type referenced by an endpoint — trash disabled, list shows entry, click jumps.**
   - Seed with type `User` and an endpoint `POST /users` whose `requestBody = ref('User')`.
   - Select `User`. Assert trash is `disabled` and its `title` contains "reference".
   - Assert a list item labelled `POST /users · requestBody` exists.
   - Click it. Assert `useSpecStore.getState().selectedEndpointId` equals the endpoint id AND the Types panel is collapsed (check `useUiPrefs().typesCollapsed === true`).
3. **Type referenced by another type — trash disabled, click changes selection.**
   - Seed with `User` and `Account` where `Account` has field `ref('User')`.
   - Select `User`. Click the `Account` entry.
   - Assert the type-name input now shows `Account` (selection switched inside the panel; panel did *not* collapse).
4. **Self-ref — trash enabled.**
   - Seed with `Tree` whose field is `array<ref('Tree')>`, no other references.
   - Assert trash is enabled; clicking it removes `Tree` from the store.
5. **Defensive guard — direct call is a no-op when usages exist.**
   - Simulate a stale-UI scenario: render with a used type, force-click the disabled button via `{ pointer-events: none }` override, then fire a click bypassing `disabled` using `fireEvent.click` on the button element directly.
   - Assert `useSpecStore.getState().spec.types['User']` still exists.
   - (Testing-library note: `fireEvent.click` on a `disabled` button does not dispatch in React — use the `onClick` prop call path by rendering with the button *temporarily* not disabled is brittle; prefer this: call the imported `remove` path via the store. The practical test is: after clicking while disabled, state is unchanged.)

Run: `pnpm --filter web test -- TypePanel`.

- [ ] **Step 6: Run the full web test suite**

`pnpm --filter web test` — expect green. No snapshots should change except for the two new files.

---

### Task 3: E2E smoke + manual check

**Files:** none

**Acceptance criteria covered:** no new acceptance criteria. This task confirms we did not regress existing flows.

- [ ] **Step 1: Run the Playwright smoke**

`pnpm --filter web test:e2e` (or whatever the existing script is — check `apps/web/package.json`). Existing `e2e/smoke.spec.ts` covers create→send→validate. It should be untouched by this feature.

- [ ] **Step 2: Manual UX pass**

Start `pnpm dev`, then:
1. Create a type `User`. Confirm trash is enabled, no "Referenced by" list.
2. Create an endpoint `POST /users` with request body `ref(User)`. Reopen Types panel, select `User`. Confirm trash is disabled and the list shows `POST /users · requestBody`.
3. Click the list entry. Confirm the endpoint is selected and the Types panel collapsed.
4. Re-open Types, select `User`, hover the disabled trash. Confirm the tooltip reads "In use by 1 reference(s) — remove those first".
5. Remove the request body from the endpoint. Reopen Types. Confirm trash is re-enabled and the list is gone.
6. Delete `User`. Confirm it is removed.
7. Create `Tree` with a self-ref array. Confirm trash is enabled; delete succeeds.

- [ ] **Step 3: Move docs**

On completion:
- Move `docs/specs/active/2026-04-17-type-delete-guard-design.md` → `docs/specs/done/`.
- Move `docs/plans/active/2026-04-18-type-delete-guard.md` → `docs/plans/done/`.
- Add a commit: `feat(types): block deleting a type that is still referenced`.

---

## Open Questions
None — the spec resolved all design questions. If the tooltip copy is wrong for zh-TW, update the locale file in the same PR.
