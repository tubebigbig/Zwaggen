# Act-warnings cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two remaining `act(...)` warning sources in `apps/web` tests without changing production code.

**Architecture:** Test-side only. Job 1 wraps a raw `input.blur()` so the store mutation it triggers runs inside an `act` scope. Job 2 wraps the async `setSpec` call in `act` and explicitly flushes the `HistoryDrawer`'s IndexedDB effect after each render.

**Tech Stack:** Vitest + `@testing-library/react` + `@testing-library/user-event` + `fake-indexeddb`.

**Worktree:** `.worktrees/act-warnings` on branch `plan/act-warnings`. All commits live inside that worktree — never on `main`, never on the primary checkout.

**Spec:** `docs/specs/active/2026-04-21-act-warnings.md`.

---

## Baseline (run once before editing)

From the worktree:

```bash
pnpm --filter web test 2>&1 | grep -cE "An update to|wrapped in act"
```

Expected **today**: a non-zero number (6 warning lines as of 2026-04-21).

Keep this number in mind — every subsequent run should reduce it, ending at `0`.

---

### Task 1: Fix TypePanel `input.blur()` warning

**Files:**
- Modify: `apps/web/tests/ui/TypePanel.test.tsx` (lines 22–30, first test only — **do not** touch the second test, the "rapid add-type" race reproducer, which intentionally uses low-level DOM to simulate a race).

**Why this fix:** `input.blur()` is a native DOM call that synchronously dispatches a React `onBlur` handler. The handler calls the Zustand store's `rename` → `setSpec`, which re-renders `TypeBuilder → ObjectControls → ExtendsPicker` outside any `act` boundary. `userEvent.tab()` moves focus away from the input and fires `blur` inside `user-event`'s built-in `act` wrapping, which resolves the warning without changing test semantics.

- [ ] **Step 1: Run the failing test in isolation and confirm the warning fires**

```bash
pnpm --filter web test -- tests/ui/TypePanel.test.tsx 2>&1 | grep -E "An update to|ExtendsPicker|ObjectControls|TypePanel inside a test"
```

Expected (before fix): 3 warning blocks naming `ExtendsPicker`, `ObjectControls`, `TypePanel`.

- [ ] **Step 2: Apply the fix**

Replace line 26 (`input.blur();`) with `await userEvent.tab();`. The surrounding lines are unchanged. After the edit, the first test looks like:

```tsx
test('add and rename a type updates refs', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { User: { kind: 'object', fields: [] } },
      endpoints: [{
        id: 'e1', method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null,
        responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
        auth: 'inherit', useProxy: 'inherit',
      }],
    },
    fileHandle: null, dirty: false,
  });
  render(<TypePanel />);
  const input = screen.getByLabelText('Type name') as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, 'Account');
  await userEvent.tab();
  await screen.findByText('Account');
  const { endpoints } = useSpecStore.getState().spec;
  expect(endpoints[0]!.responses[0]!.type).toEqual({ kind: 'ref', ref: 'Account' });
});
```

The second test (`rapid add-type does not clobber...`) is NOT modified — its use of `fireEvent.blur(stillFocused)` is already wrapped in `act` via its surrounding `await act(async () => { ... })`.

- [ ] **Step 3: Re-run and confirm only the RunPanel warnings remain**

```bash
pnpm --filter web test 2>&1 | grep -cE "An update to|wrapped in act"
```

Expected: a smaller number than baseline (the 3 TypePanel-stack lines should be gone; the RunPanel-stack lines remain).

Also run the TypePanel file alone and confirm both its tests still pass:

```bash
pnpm --filter web test -- tests/ui/TypePanel.test.tsx
```

Expected: `Tests  2 passed (2)` and **no** `ExtendsPicker`/`ObjectControls`/`TypePanel` act warnings on stderr.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/ui/TypePanel.test.tsx
git commit -m "test(web): wrap TypePanel rename blur in act via userEvent.tab

Raw input.blur() dispatched the store rename -> setSpec re-render outside
act. userEvent.tab() fires blur through user-event's built-in act wrapping,
which quiets ExtendsPicker/ObjectControls/TypePanel update-in-test warnings
without changing what the test asserts. Second test (rapid-add race
reproducer) is intentionally untouched — it needs low-level DOM access."
```

---

### Task 2: Fix RunPanel baseUrl-resync warning

**Files:**
- Modify: `apps/web/tests/ui/RunPanel.test.tsx` — specifically the second test, `resyncs the Base URL input when spec.info.baseUrl changes` (lines 29–45). Other tests in the file also mount `HistoryDrawer` but don't trigger warnings because their assertions run inside `userEvent` / `waitFor` scopes that happen to flush in time.

**Why this fix:**
- `HistoryDrawer`'s mount effect fires `loadHistory(endpointId).then(setEntries)`. Against `fake-indexeddb`, the promise resolves in a later microtask, and its `setEntries` call lands outside `act` whenever the test body happens to have already reached its next assertion. Wrapping each render's follow-on flush inside `act` closes the window.
- `await useSpecStore.getState().setSpec({...})` runs `set(...)` synchronously (re-rendering subscribed components) and then awaits `saveDraft`. Wrapping the whole call in `await act(async () => {...})` ensures the subscriber re-render **and** the downstream `setBaseUrl` effect in `RunPanel` are flushed inside the `act` boundary.

- [ ] **Step 1: Confirm the warning set pre-fix**

```bash
pnpm --filter web test -- tests/ui/RunPanel.test.tsx 2>&1 | grep -E "An update to|RunPanel inside|HistoryDrawer inside"
```

Expected (before fix): warning blocks naming `RunPanel` (x2) and `HistoryDrawer`.

- [ ] **Step 2: Add the `act` import**

At the top of `apps/web/tests/ui/RunPanel.test.tsx`, change line 2 from:

```ts
import { render, screen, waitFor } from '@testing-library/react';
```

to:

```ts
import { act, render, screen, waitFor } from '@testing-library/react';
```

- [ ] **Step 3: Rewrite the failing test to wrap mutations in `act`**

Replace the entire second test (lines 29–45) with:

```ts
it('resyncs the Base URL input when spec.info.baseUrl changes', async () => {
  const s = specWithEndpoint();
  await useSpecStore.getState().replaceSpec(s, null);
  useSpecStore.getState().selectEndpoint(s.endpoints[0]!.id);

  const { rerender } = render(<RunPanel />);

  // Flush HistoryDrawer's async loadHistory().then(setEntries) effect so
  // its setState lands inside act, not after the next test assertion.
  await act(async () => { await Promise.resolve(); });

  expect(screen.getByLabelText('Base URL')).toHaveValue('');

  await act(async () => {
    await useSpecStore.getState().setSpec({
      ...useSpecStore.getState().spec,
      info: { ...useSpecStore.getState().spec.info, baseUrl: 'https://new.example' },
    });
  });
  rerender(<RunPanel />);
  await waitFor(() => {
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://new.example');
  });
});
```

Changes vs. current:
1. Added `await act(async () => { await Promise.resolve(); });` after `render(...)` to drain the pending HistoryDrawer load-history microtask.
2. Wrapped the `setSpec` call in `await act(async () => { ... })` so the subscriber re-render and the `useEffect([spec.info.baseUrl])` in `RunPanel` both flush inside `act`.

The first test (`initializes the Base URL input from spec.info.baseUrl`) and third test (`editing the input does not mutate the spec`) are **not** modified — they are already silent because their assertions land before HistoryDrawer's async effect resolves (test 1) or use `userEvent` throughout (test 3).

- [ ] **Step 4: Verify this test file is now warning-free**

```bash
pnpm --filter web test -- tests/ui/RunPanel.test.tsx 2>&1 | grep -cE "An update to|wrapped in act"
```

Expected: `0`.

And:

```bash
pnpm --filter web test -- tests/ui/RunPanel.test.tsx
```

Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Run the full suite and confirm zero act warnings remain**

```bash
pnpm --filter web test 2>&1 | grep -cE "An update to|wrapped in act"
```

Expected: `0`.

```bash
pnpm --filter web test
```

Expected: `Tests  248 passed (248)`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/ui/RunPanel.test.tsx
git commit -m "test(web): wrap RunPanel resync mutation in act + flush HistoryDrawer

HistoryDrawer's loadHistory().then(setEntries) effect and RunPanel's
baseUrl-resync useEffect both landed setState outside act, producing three
update-in-test warnings. Drain the initial microtask with act(()=>...) after
render, and wrap the async setSpec() in act so subscriber re-renders and
follow-on effects flush inside the act boundary."
```

---

## Self-review checklist (plan author)

- [x] Spec coverage: both warning sources in the spec are each assigned to a task.
- [x] No placeholders — every step shows the actual code or command.
- [x] Type/symbol consistency: `act`, `userEvent.tab`, `setSpec`, `replaceSpec`, `selectEndpoint`, `HistoryDrawer` all match names that already exist in `apps/web`.
- [x] Diff stays confined to the two files named in the spec.
- [x] Success criterion (zero act warnings, 248/248) is asserted in Task 2 Step 5.

## Handoff

Dispatch `superpowers:subagent-driven-development` from the primary checkout. Each task above is a fresh subagent session that commits inside `.worktrees/act-warnings`. After Task 2 Step 6, return here to FF-merge and move the spec/plan to `done/`.
