# Spec — Fix TypePanel rapid-Add-type race

## Problem

In `apps/web/src/ui/TypePanel.tsx`, the "Type name" rename input (lines 145-150) uses `defaultValue={selected}` with an `onBlur` handler that calls `rename(selected, e.target.value)`:

```tsx
<input
  aria-label="Type name"
  className="input flex-1 font-mono text-xs"
  defaultValue={selected}
  onBlur={(e) => void rename(selected, e.target.value)}
/>
```

Because `defaultValue` is only honored on mount, the DOM input keeps the *previous* selection's text after `setSelected(newName)` runs (from `addType` at line 34 or a sibling-click at line 131). If the user:

1. Focuses the rename input (showing e.g. `UserId`),
2. Clicks "+" to add a new type → `addType` generates `NewType`, calls `setSpec`, then `setSelected("NewType")`,
3. Clicks elsewhere (blur fires),

then the `onBlur` closure captures the *stale* `selected` ("UserId") and reads the *stale* DOM value ("UserId"), but in reality has already been superseded by the new `NewType` selection. Worst case: the closure runs `rename("UserId", "UserId")` which is a no-op, but the input is still displaying the old name while the selection has moved on — confusing, and easy to trigger a real clobber by editing the input text quickly after Add.

A tighter reproducer (the one the TODO describes): focus the input, type a new name, then hit "+" to add. The blur on the old input fires after `setSelected(newType)` has already committed. The closure reads `selected="UserId"` and `e.target.value="UserEdited"` and renames `UserId → UserEdited`, erasing the user's intent (they wanted to add a fresh type, not rename the previous one).

## Root cause

1. Input is uncontrolled (`defaultValue` not `value`), so React does not keep its DOM value in sync with the selected type.
2. Input is not keyed on `selected`, so React does not remount it when the selection changes — the stale DOM value and stale `onBlur` closure both survive.

## Success criteria

- Adding a new type via the "+" button immediately shows the new type's name in the rename input; no stale text from the previous selection is visible.
- Rapid sequence "focus → edit text → click Add" does not rename the previously-selected type. It either renames nothing (safest), or only the now-current (newly-added) type.
- Clicking between types still lets the user rename via blur as before.
- The rename input still shows the current name on mount.
- No regression in existing `TypePanel.test.tsx`.

## Out of scope

- Broader TypePanel UX redesign.
- Other uncontrolled inputs elsewhere in the app (TypeBuilder, RunPanel, etc.).

## Approach

Two viable fixes (the TODO mentions both):

1. **Controlled input (`value`/`onChange`).** Requires a local `nameDraft` state synced with `selected`. More plumbing but fully deterministic.
2. **`key={selected}` remount.** Keep `defaultValue`/`onBlur`, but add `key={selected}` so React unmounts the old input and mounts a new one whenever the selection changes. The new input starts with the fresh `defaultValue` and a fresh `onBlur` closure; stale DOM value is discarded.

**Decision: Option 2 (`key={selected}`).** Minimal diff, preserves the blur-to-commit UX (which is deliberate — users don't want to commit a rename on every keystroke), and eliminates both the stale-DOM-value and stale-closure concerns in one stroke. Option 1 would require introducing a `useEffect` sync or a controlled-component pattern that this single input doesn't justify.

Edge case considered: when a rename succeeds, `rename` calls `setSelected(newName)` (line 40). With `key={selected}` this remounts the input, which means focus is lost — acceptable, because the user just blurred anyway, and the rename is the terminal action.
