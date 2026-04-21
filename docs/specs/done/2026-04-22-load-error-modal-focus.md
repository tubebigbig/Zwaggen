# Spec — Move focus into `LoadErrorModal` on open

## Problem

`apps/web/src/ui/LoadErrorModal.tsx` (shipped 2026-04-21) doesn't move focus into the dialog when it appears. Keyboard / screen-reader users triggering an open failure land focus on the outer `Open` button which is now hidden behind the modal — they can't reach the Dismiss control without first tabbing through the entire page or clicking.

The load-error-modal code review filed this as a non-blocking follow-up.

## Success criteria

- When `<LoadErrorModal>` mounts, focus moves to the bottom "Dismiss" button (text button, not the header icon X — the text button is the clearer keyboard target and is the last element in the tab order, making Escape-like shift-tab feel natural).
- A regression test asserts `document.activeElement` is the bottom Dismiss button immediately after the dialog appears.
- No existing test regresses. No change to the three existing LoadErrorModal tests.
- No change to `AppHeader.tsx` or any other file.

## Out of scope

- Focus trap (keeping Tab inside the dialog). Larger design decision — most of Zwaggen's other overlays (`DiffPanel`, `BatchRunPanel`) don't trap either.
- Escape-key to close. Same argument — file separately if we want it.
- Restoring focus to the Open button when the modal closes. Nice-to-have, but implementation requires storing the previously-focused element; defer.
- Focusing elsewhere (e.g., the link, the filename chip, the close-X). The bottom Dismiss is the least-destructive default.

## Approach

One-line `useEffect` on mount that focuses the bottom Dismiss button via a `ref`. Five-line change in `LoadErrorModal.tsx`:

```tsx
import { useEffect, useRef } from 'react';
// ...
const dismissRef = useRef<HTMLButtonElement>(null);
useEffect(() => { dismissRef.current?.focus(); }, []);
// ...
<button ref={dismissRef} className="btn" onClick={onClose}>{t('dismiss')}</button>
```

Regression test appends to `apps/web/tests/ui/AppHeader.loadError.test.tsx` — trigger a failed open, `findByRole('dialog')`, then assert `document.activeElement` equals the bottom Dismiss text button (disambiguate from the icon X using button class or tab-order position).
