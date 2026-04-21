# Plan — Move focus into `LoadErrorModal` on open

Spec: `docs/specs/active/2026-04-22-load-error-modal-focus.md`.

Execute on branch `plan/load-error-modal-focus` in `.worktrees/load-error-modal-focus`. All git ops inside the worktree. Two commits (fix + test) + one archive commit.

## Tasks

### 1. Add focus-on-open to `LoadErrorModal.tsx`

**File:** `apps/web/src/ui/LoadErrorModal.tsx`.

Changes:

1. Add `useEffect, useRef` to the React import at the top — currently only imports from `react-i18next`. Add a line:
```tsx
import { useEffect, useRef } from 'react';
```

2. Inside the component, after the `useTranslation()` call, add:
```tsx
const dismissRef = useRef<HTMLButtonElement>(null);
useEffect(() => {
  dismissRef.current?.focus();
}, []);
```

3. Attach the ref to the **bottom text** Dismiss button (the one inside the footer `<div className="flex justify-end ...">`, not the header icon X):
```tsx
<button ref={dismissRef} className="btn" onClick={onClose}>
  {t('dismiss')}
</button>
```

Do NOT change anything else (no new props, no Escape handling, no focus trap). The empty dep array `[]` ensures the focus fires once on mount.

Verify:
```bash
cd /Users/victorliang/Zwaggen/.worktrees/load-error-modal-focus
pnpm --filter web exec tsc -b
```

Commit:
```
feat(web): focus Dismiss button on LoadErrorModal open

When the dialog appears, move focus into it so keyboard and screen-
reader users land on an interactive control instead of the Open
button that's now occluded behind the modal. One-shot mount effect;
no focus trap or Escape handling (those are larger UX decisions).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 2. Regression test

**File:** `apps/web/tests/ui/AppHeader.loadError.test.tsx` — append one new test after the existing five.

```tsx
it('focuses the Dismiss button when the modal opens', async () => {
  vi.mocked(fileModule.uploadFile).mockResolvedValueOnce({
    name: 'broken.json',
    text: 'not json',
  });
  render(<AppHeader />);
  await clickOpen();
  const dialog = await screen.findByRole('dialog');
  // Two buttons match "dismiss": the header icon X (aria-label) and the
  // bottom text button. The focused one is the text button (class "btn",
  // not "btn-icon"). The `within(dialog)` scope is important — AppHeader
  // itself may render other buttons with matching aria-labels.
  const dismissButtons = within(dialog).getAllByRole('button', { name: /dismiss/i });
  const textDismiss = dismissButtons.find((b) => b.className.includes('btn') && !b.className.includes('btn-icon'));
  expect(textDismiss).toBeDefined();
  expect(document.activeElement).toBe(textDismiss);
});
```

Run:
```bash
pnpm --filter web test tests/ui/AppHeader.loadError.test.tsx 2>&1 | tee /tmp/focus.log
grep -cE "An update to|wrapped in act" /tmp/focus.log
pnpm --filter web test 2>&1 | tee /tmp/full.log
grep -cE "An update to|wrapped in act" /tmp/full.log
```

Dedicated suite should go from 5 → 6 tests passing. Full suite green. 0 act warnings.

Commit:
```
test(web): cover focus-on-open for LoadErrorModal

Asserts document.activeElement is the bottom Dismiss text button
immediately after the dialog appears.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 3. Archive + tick TODO

One commit inside the worktree:

- `git mv docs/specs/active/2026-04-22-load-error-modal-focus.md docs/specs/done/`
- `git mv docs/plans/active/2026-04-22-load-error-modal-focus.md docs/plans/done/`
- In `docs/TODO.md`, under `## Follow-up from shipped work`, flip:
  ```
  - [ ] `LoadErrorModal` should move focus into the dialog on open (e.g., `autoFocus` on the Dismiss button or a ref-based focus shift). Today, screen-reader / keyboard users land behind the modal on the triggering Open button. Found during load-error-modal code review.
  ```
  to:
  ```
  - [x] `LoadErrorModal` should move focus into the dialog on open — see `docs/plans/done/2026-04-22-load-error-modal-focus.md`.
  ```
- Bump `Last updated:` to `2026-04-22 (load-error-modal-focus)`.

```
docs: ship load-error-modal-focus — move spec+plan to done, tick TODO

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Execution strategy

One implementer subagent (tasks 1+2). Spec + code reviews in parallel. Archive subagent. FF-merge + push.
