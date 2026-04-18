# Plan — Fix TypePanel rapid-Add-type race

Spec: `docs/specs/active/2026-04-19-typepanel-add-type-race.md`.

Execute on branch `plan/typepanel-add-type-race` in `.worktrees/typepanel-add-type-race`. All commits inside the worktree; never `cd` to the primary repo. One task commit + one archive commit.

## Tasks

### 1. Add `key={selected}` to the rename input

**File:** `apps/web/src/ui/TypePanel.tsx` lines 145-150.

Change:

```tsx
<input
  aria-label="Type name"
  className="input flex-1 font-mono text-xs"
  defaultValue={selected}
  onBlur={(e) => void rename(selected, e.target.value)}
/>
```

to:

```tsx
<input
  key={selected}
  aria-label="Type name"
  className="input flex-1 font-mono text-xs"
  defaultValue={selected}
  onBlur={(e) => void rename(selected, e.target.value)}
/>
```

Single-line insertion of `key={selected}`. Do not modify `addType`, `rename`, or any surrounding JSX. Do not alter any tests unless they explicitly assert on the missing `key` (they won't).

### 2. Add a regression test

**File:** `apps/web/tests/ui/TypePanel.test.tsx` — append a new test case.

Test the race path: starting from a spec with a single type `UserId`, select it, focus the rename input, then trigger `addType` via the "+" button, then blur the (now-unmounted) old input. Assert that `UserId` still exists in the spec afterwards — i.e., no clobber-rename happened.

Sketch (adapt to the existing test file's helpers and imports — read the file first):

```tsx
it('rapid add-type does not clobber the previously-selected type', async () => {
  // seed spec with one type
  await act(async () => {
    await useSpecStore.getState().setSpec({
      ...emptySpec(),
      types: { UserId: { kind: 'object', fields: [] } },
    });
  });

  render(<TypePanel />);
  // expand panel if needed (check existing tests for the pattern)
  const nameInput = screen.getByLabelText('Type name') as HTMLInputElement;
  expect(nameInput.value).toBe('UserId');

  // focus + click Add in rapid succession
  nameInput.focus();
  await userEvent.click(screen.getByLabelText(/addType/i));

  // blur whatever's focused (old input is gone; blur the active element or fire on document)
  // The key={selected} remount means the OLD onBlur closure is gone.
  await act(async () => {
    document.body.focus();
  });

  const types = Object.keys(useSpecStore.getState().spec.types);
  expect(types).toContain('UserId');      // original survived
  expect(types.some((n) => n.startsWith('NewType'))).toBe(true);  // new one added
});
```

If the existing test file doesn't already import `userEvent`, `act`, `useSpecStore`, or `emptySpec`, add what's needed. Match the file's conventions for store seeding (look at an existing test in the same file).

Run:
```
pnpm --filter web test TypePanel
pnpm --filter web exec tsc -b
```
Both must pass. If the test framework uses `vi.fn()` generics that require tightening due to `noUncheckedIndexedAccess`, fix the types inline — don't work around with `@ts-ignore`.

### 3. Commit and archive

One commit for the fix + test:

```
fix(web): prevent stale rename closure clobber in TypePanel

Add key={selected} to the rename input so a new type selection
remounts the input and discards the previous selection's onBlur
closure and DOM value. Regression test covers the add-during-edit
race path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Then the archive commit (on the same branch, still inside the worktree):

```
docs: tick TypePanel add-type race TODO; archive spec + plan
```

Archive moves spec + plan from `docs/specs/active/` to `docs/specs/done/` and from `docs/plans/active/` to `docs/plans/done/`. In `docs/TODO.md`, tick the "TypePanel rapid-Add-type race" line under "Follow-up from shipped work" from `[ ]` to `[x]` and append a short pointer `— see docs/plans/done/2026-04-19-typepanel-add-type-race.md`. Bump `Last updated:` to `2026-04-19` if not already.

## Execution strategy

One implementer subagent covers tasks 1 + 2. One archive subagent covers task 3. Lightweight review after each.
