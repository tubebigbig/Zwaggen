# Spec — Save UX polish (Toast + beforeunload)

## Problem

User feedback after reviewing Slice A (save-data-loss-fix):

1. Slice A's three `alert()` calls in `saveSpec` are jarring (especially the "Downloaded spec.zwaggen.json…" one on browsers without File System Access API support — Safari, Firefox). A non-blocking toast is the right surface for these notifications.
2. There's no protection against accidental tab close when the spec has unsaved edits. The user wants the standard browser "Leave site? Changes you made may not be saved." prompt via `beforeunload`.

This slice ships on the same branch as Slice A so the PR delivers the data-loss fix AND the polish in one cohesive review.

## Success criteria

- A new lightweight Toast system: `pushToast(message, kind, durationMs?)` adds an entry; the entry auto-dismisses after `durationMs` (default 4000), and the user can dismiss manually via an X button.
- Toast kinds: `info` (slate), `success` (emerald), `error` (red), `warning` (amber). Visual differentiation only — no semantic difference in behavior.
- Toasts render top-right of the app shell, stacked, with a small slide-in animation. `aria-live="polite"` for screen readers.
- The 3 `alert()` calls in `saveSpec` are replaced:
  - `alert("Cannot save: N broken type references...")` → `pushToast(..., 'error')`
  - `alert("Save failed: <msg>")` → `pushToast(..., 'error')`
  - `alert("Downloaded spec.zwaggen.json — your in-app draft is preserved...")` → `pushToast(..., 'info', 8000)` (longer duration since the message has actionable hint)
- `beforeunload` listener registered once at the App level. Triggers when `useSpecStore.getState().dirty === true`. Browser shows its standard prompt; users can confirm or cancel.
- Tests:
  - `pushToast` adds the entry; `dismissToast(id)` removes it; auto-dismiss timer fires after the duration.
  - `<ToastList />` renders the queued toasts; clicking dismiss removes one.
  - `saveSpec` write-error path calls `pushToast` with `kind: 'error'` (no `alert` triggered).
  - `saveSpec` download-blob fallback calls `pushToast` with `kind: 'info'`.
  - `beforeunload` handler calls `preventDefault` when dirty, no-op when clean.

## Out of scope

- Migrating the OTHER `alert()` calls scattered around the app (Slice 2A's `deleteTypeFolderInUse`, the broken-refs alert in TypePanel, etc.) — that's a follow-up sweep. We keep this slice focused on the Save flow that prompted the feedback.
- Customizing per-toast positioning, animations, or theming. v1 is one fixed pattern.
- A confirm-on-discard prompt for in-app navigation (e.g., switching specs without saving). The browser's `beforeunload` handles tab/window close; in-app navigation is rare and out of scope.
- Persisting toasts across reloads (they're ephemeral by design).
- A "Don't ask again" option on the beforeunload prompt. Browsers manage that themselves.

## Approach

### Toast store — `apps/web/src/state/toasts.ts`

```ts
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
  durationMs: number;
}

interface ToastStore {
  toasts: Toast[];
  pushToast(message: string, kind?: ToastKind, durationMs?: number): string;
  dismissToast(id: string): void;
}

const DEFAULT_DURATION = 4000;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  pushToast(message, kind = 'info', durationMs = DEFAULT_DURATION) {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { id, message, kind, durationMs }] });
    // Auto-dismiss
    setTimeout(() => get().dismissToast(id), durationMs);
    return id;
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

// Convenience exports for non-React callers
export const pushToast = (m: string, k?: ToastKind, d?: number) => useToasts.getState().pushToast(m, k, d);
export const dismissToast = (id: string) => useToasts.getState().dismissToast(id);
```

### Toast UI — `apps/web/src/ui/ToastList.tsx`

```tsx
import { useToasts, dismissToast, type Toast } from '../state/toasts';
import { IconX } from './icons';

const KIND_STYLES: Record<Toast['kind'], string> = {
  info: 'border-slate-200 bg-slate-50 text-slate-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

export function ToastList() {
  const toasts = useToasts((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow-pop ${KIND_STYLES[t.kind]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            className="btn-icon"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(t.id)}
          >
            <IconX />
          </button>
        </div>
      ))}
    </div>
  );
}
```

Render once in App.tsx near the other top-level mounted modals.

### `saveSpec` — replace alerts with pushToast

In `apps/web/src/ui/AppHeader.tsx`:

```ts
import { pushToast } from '../state/toasts';

async function saveSpec(opts?: { forceDialog?: boolean }) {
  const broken = collectBrokenRefs(spec);
  if (broken.length > 0) {
    pushToast(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`, 'error');
    return;
  }
  const onDisk = stripSecrets(spec);
  const existing = await loadSecrets();
  await saveSecrets({ ...existing, ...extractSecrets(spec) });
  const text = toJSON(onDisk);
  if (fileHandle && !opts?.forceDialog) {
    try {
      await getStorage().writeFile(fileHandle, text);
    } catch (err) {
      pushToast(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return;
    }
    await markSaved(fileHandle);
    return;
  }
  if (getStorage().supportsNativePicker()) {
    const h = await getStorage().pickSave();
    if (!h) return;
    try {
      await getStorage().writeFile(h, text);
    } catch (err) {
      pushToast(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return;
    }
    await markSaved(h);
  } else {
    downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.zwaggen.json');
    pushToast("Downloaded spec.zwaggen.json — your in-app draft is preserved. Use 'Open' to re-attach the file as your editing source.", 'info', 8000);
  }
}
```

### `beforeunload` — App.tsx

```tsx
useEffect(() => {
  function handler(e: BeforeUnloadEvent) {
    if (!useSpecStore.getState().dirty) return;
    e.preventDefault();
    e.returnValue = '';  // modern browsers ignore custom strings; this is the canonical opt-in
  }
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, []);
```

The handler reads `dirty` IMPERATIVELY via `useSpecStore.getState()` so we don't have to re-register on every dirty change. (Stale-closure-safe.)

### Existing test updates

`apps/web/tests/ui/AppHeader.save.test.tsx` (3 tests) currently spy on `window.alert`. After this slice they should spy on the toast system instead:

```ts
import { useToasts } from '../../src/state/toasts';

// instead of vi.spyOn(window, 'alert'):
const toasts = () => useToasts.getState().toasts;
// ...
expect(toasts()).toContainEqual(expect.objectContaining({ kind: 'error', message: expect.stringMatching(/Save failed.*quota/) }));
```

Reset toasts in `beforeEach`: `useToasts.setState({ toasts: [] });`.

### Risks

- **Toast auto-dismiss + tests**: `setTimeout` inside `pushToast` may interact with vitest fake timers oddly. If tests get flaky, separate the auto-dismiss into a `useEffect` inside `<Toast />` so the timer is React-managed.
- **Multiple toasts stacking**: 5+ toasts would overflow the viewport. v1 has no max — if needed we can cap and replace oldest. Defer.
- **`beforeunload` blocking automated tests**: Vitest's jsdom shouldn't trigger `beforeunload`, but if it does, the handler can check `process.env.NODE_ENV !== 'test'` or rely on the dirty flag being false in test setup.
- **`beforeunload` during the Save flow itself**: in theory, after `markSaved` runs `dirty: false`, the handler won't fire. But if the user closes the tab WHILE the save is in flight (between writeFile and markSaved), the handler fires (dirty is still true) — which is correct behavior (the save isn't done yet).

## Done definition

- Toast store + UI mounted.
- All 3 `alert()` calls in `saveSpec` replaced with `pushToast`.
- `beforeunload` handler registered in App.tsx.
- Updated tests use the toast store assertion pattern instead of `alert` spy.
- All tests + lint green.
- Spec + plan moved to `done/`.
- (Branch already pushed; new commits will append.)
