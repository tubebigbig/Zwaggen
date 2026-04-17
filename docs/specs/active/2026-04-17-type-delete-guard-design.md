# Type delete guard — prevent deleting a type that is in use

**Status**: draft
**Date**: 2026-04-17
**Area**: `apps/web` — schema + Types panel

## Problem

Today, `TypePanel.remove()` (apps/web/src/ui/TypePanel.tsx:39) deletes a type unconditionally. If any endpoint or any other type still references that name, the result is a spec full of broken refs. The existing safety nets are reactive: `collectBrokenRefs` surfaces an alert in the Types panel and `AppHeader.saveSpec()` blocks save. They tell the user *something is broken after the fact* — they don't prevent the breakage.

## Goal

Prevent deletion of a type while any endpoint or any other type references it. Show the user *where* those references live so they can clean up and delete.

## Non-goals

- Does not change behavior for specs loaded from disk that already contain broken refs — the existing `collectBrokenRefs` alert keeps handling that case.
- Does not change `renameType` — rename already rewrites refs and never creates dangling references.
- Does not add a cascade-delete or "replace refs with inline type" flow.
- Does not change how endpoints or types are selected beyond wiring existing actions to the new usage list.

## Requirements

1. When the selected type has at least one reference from an **endpoint** or from **another type**, the delete button in the Types panel is disabled, with a tooltip explaining why.
2. Self-references (a type containing a ref to itself) do **not** block deletion. They disappear with the type.
3. When usages exist, a "Referenced by" list is rendered under the type-name input. Each entry is a clickable button.
4. Clicking an endpoint entry selects that endpoint (existing store action) and collapses the Types panel.
5. Clicking a type entry changes the selected type inside the Types panel.
6. `remove()` in `TypePanel.tsx` gains a defensive guard (`if (usages.length > 0) return`) — UI state should never allow a blocked delete, but the function must not delete if called directly.
7. Existing broken-ref alert and Save-block remain unchanged.

## Design

### Schema layer — `apps/web/src/schema/rename.ts`

Add two exports alongside the existing `collectBrokenRefs`:

```ts
export type Usage =
  | { kind: 'endpoint'; endpointId: string; label: string }
  | { kind: 'type';     typeName: string;   label: string };

export function buildUsageIndex(spec: Spec): Record<string, Usage[]>;
```

- **Key** is the referenced type name. **Value** is every place where that name appears as `{ kind: 'ref', ref: <name> }`.
- **Self-ref exclusion**: when walking the tree of a type named `T`, any `ref: T` encountered inside that tree is skipped — it would not outlive the deletion.
- **Label format** — human-readable, separate from the internal `collectBrokenRefs` path strings:
  - Endpoint: `"<METHOD> <path> · <section>"` where `<section>` is `requestBody`, `responses[i]`, `pathParams[i]`, `queryParams[i]`, or `headers[i]`. Array indices are 0-based, matching `collectBrokenRefs`.
  - Type: the containing type name (e.g., `"Account"`). Field paths inside the type are not part of the label — the click takes the user to the type editor where the fields are visible.
- The walker uses the existing `walk` fold internally. A small wrapper threads the "containing type name" through when iterating `spec.types` so self-refs can be filtered.
- Order: endpoints iterated in `spec.endpoints` order (stable), types iterated by `Object.keys(spec.types)` order (insertion order). Deterministic output supports snapshot-friendly tests.

### UI layer — `apps/web/src/ui/TypePanel.tsx`

- Compute the index once per spec:
  ```ts
  const usageIndex = useMemo(() => buildUsageIndex(spec), [spec]);
  const usages = selected ? usageIndex[selected] ?? [] : [];
  ```
- **Delete button**: `disabled={usages.length > 0}`. Tooltip: `"In use by {N} reference(s) — remove those first"` when disabled, `"Delete type"` when enabled.
- **`remove()` guard**: `if (usages.length > 0) return;` at the start of the function.
- **"Referenced by" list**: rendered when `usages.length > 0`, positioned under the type-name input and above the `TypeBuilder`. Each item is a `<button>`:
  - Endpoint: calls `selectEndpoint(endpointId)` (from `useSpecStore`) and `setUiPref('typesCollapsed', true)`.
  - Type: calls `setSelected(typeName)` (local state already in `TypePanel`).
- Visual treatment: the list uses existing small-text / slate styling; no new colors. The disabled trash matches current disabled button affordances.

### Unchanged

- `collectBrokenRefs` and the save-time block in `AppHeader.saveSpec()` (apps/web/src/ui/AppHeader.tsx:48).
- The broken-ref alert rendered inside `TypePanel`.
- `renameType`.

## Architecture & data flow

```
spec  ─►  buildUsageIndex(spec)  ─►  Record<typeName, Usage[]>
                                            │
                                            ▼
                         TypePanel ── disables trash
                                   ── renders "Referenced by" list
                                   ── click → selectEndpoint | setSelected
```

One pass over `spec.types` + `spec.endpoints`; O(N) in the number of ref nodes. Recomputes only when `spec` changes (`useMemo`).

## Testing

### Unit — `apps/web/tests/schema/usageIndex.test.ts` (new)

- Endpoint usages: `requestBody`, `pathParams[i]`, `queryParams[i]`, `headers[i]`, `responses[i]` each produce a `Usage` with the expected label.
- Type usages: ref inside nested object field, inside array element, inside union variant.
- Self-ref: a type whose field has `ref` to itself — not present in the index entry for that type.
- Unused type: its key is **absent** from the index (the UI reads with `usageIndex[name] ?? []`).
- Multiple references to the same type from different locations — all captured, in deterministic order.

### Component — `apps/web/tests/ui/TypePanel.usageGuard.test.tsx` (new)

- Type with no usages: trash button is enabled; "Referenced by" section not rendered.
- Type referenced by an endpoint: trash disabled, tooltip matches, list shows one entry; clicking it calls the `selectEndpoint` store action and sets `typesCollapsed = true`.
- Type referenced by another type: trash disabled, list shows the containing type; clicking it changes `selected` within the panel (no panel collapse, no endpoint selection).
- Self-ref type (no other references): trash enabled; deletion succeeds.
- Direct call to the delete path on a used type (e.g., simulating a stale UI) must not mutate the spec — covered by asserting the post-state after the disabled trash is clicked.

## Error handling

No new error surfaces. The feature is constraint enforcement via UI state — there is no async or external I/O. The defensive `remove()` guard silently no-ops if somehow called with usages present; no toast or alert is needed because the UI state prevents the call in the first place.

## Open questions

None at design time — all clarifying questions resolved during brainstorming (hard-block, inline clickable list, self-refs ignored, jump both endpoints and types, full reverse index via `buildUsageIndex`).
