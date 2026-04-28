# Save UX polish (Slice C — same branch as Slice A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3 `alert()` calls in `saveSpec` with non-blocking toasts, plus add a `beforeunload` confirm when the spec has unsaved edits. Lands on the same branch as Slice A (`plan/save-data-loss-fix`) so the PR delivers data-loss-fix + UX polish together.

**Architecture:** New tiny Toast subsystem (Zustand store + `<ToastList />` component) mounted at App. `saveSpec` calls `pushToast(...)` instead of `alert(...)`. App.tsx registers a `beforeunload` listener that reads `dirty` imperatively from the store.

**Tech Stack:** React, Zustand, vitest. No new deps.

---

### Spec

See `docs/specs/active/2026-04-28-save-ux-polish.md`. Constraints:

- Toast types: info / success / error / warning. Auto-dismiss after `durationMs` (default 4s); manual dismiss via X.
- 3 alert call sites in `saveSpec` migrate to `pushToast` (others stay alert for now).
- `beforeunload` triggers ONLY when `dirty === true`. Reads state imperatively to avoid stale closures.

---

### Task 1: Toast store + `<ToastList />` component

**Files:**
- Create: `apps/web/src/state/toasts.ts`
- Create: `apps/web/src/ui/ToastList.tsx`
- Create: `apps/web/tests/state/toasts.test.ts`
- Create: `apps/web/tests/ui/ToastList.test.tsx`

- [ ] **Step 1: Toast store**

```ts
// apps/web/src/state/toasts.ts
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
    setTimeout(() => get().dismissToast(id), durationMs);
    return id;
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const pushToast = (m: string, k?: ToastKind, d?: number) => useToasts.getState().pushToast(m, k, d);
export const dismissToast = (id: string) => useToasts.getState().dismissToast(id);
```

- [ ] **Step 2: ToastList component**

```tsx
// apps/web/src/ui/ToastList.tsx
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
            className="btn-icon shrink-0"
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

- [ ] **Step 3: Tests for the store**

```ts
// apps/web/tests/state/toasts.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useToasts } from '../../src/state/toasts';

beforeEach(() => {
  useToasts.setState({ toasts: [] });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('pushToast adds an entry', () => {
  const id = useToasts.getState().pushToast('Hello', 'info');
  expect(useToasts.getState().toasts).toHaveLength(1);
  expect(useToasts.getState().toasts[0]?.id).toBe(id);
  expect(useToasts.getState().toasts[0]?.kind).toBe('info');
});

it('dismissToast removes the entry', () => {
  const id = useToasts.getState().pushToast('Bye', 'error');
  useToasts.getState().dismissToast(id);
  expect(useToasts.getState().toasts).toHaveLength(0);
});

it('auto-dismisses after the duration', () => {
  useToasts.getState().pushToast('Brief', 'info', 1000);
  expect(useToasts.getState().toasts).toHaveLength(1);
  vi.advanceTimersByTime(999);
  expect(useToasts.getState().toasts).toHaveLength(1);
  vi.advanceTimersByTime(2);
  expect(useToasts.getState().toasts).toHaveLength(0);
});
```

- [ ] **Step 4: Tests for the component**

```tsx
// apps/web/tests/ui/ToastList.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { ToastList } from '../../src/ui/ToastList';
import { useToasts } from '../../src/state/toasts';

beforeEach(() => {
  useToasts.setState({ toasts: [] });
});

it('renders nothing when there are no toasts', () => {
  const { container } = render(<ToastList />);
  expect(container.firstChild).toBeNull();
});

it('renders each toast and dismisses on click', async () => {
  useToasts.getState().pushToast('hello world', 'info', 60000);
  render(<ToastList />);
  expect(screen.getByText('hello world')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
  expect(screen.queryByText('hello world')).toBeNull();
});
```

- [ ] **Step 5: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/save-data-loss-fix
pnpm install   # if node_modules empty
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/state/toasts.ts apps/web/src/ui/ToastList.tsx apps/web/tests/state/toasts.test.ts apps/web/tests/ui/ToastList.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): tiny Toast store + ToastList component

Foundation for replacing alert() calls in saveSpec with non-blocking
notifications. ~80 lines total: a Zustand store with pushToast /
dismissToast and auto-dismiss timer, plus a top-right rendering
component with kind-based styling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Replace `saveSpec` alerts with `pushToast` + mount `<ToastList />`

**Files:**
- Modify: `apps/web/src/ui/AppHeader.tsx` — 3 alert→pushToast swaps.
- Modify: `apps/web/src/App.tsx` — render `<ToastList />` once at the app shell.
- Modify: `apps/web/tests/ui/AppHeader.save.test.tsx` — assert via `useToasts` state instead of `window.alert` spy.

- [ ] **Step 1: Patch `saveSpec` alert calls**

In `AppHeader.tsx`, import `pushToast` from `../state/toasts`. Replace the 3 alerts:

```ts
// "Cannot save: N broken type references"
pushToast(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`, 'error');

// "Save failed: ..."  (both call sites)
pushToast(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error');

// "Downloaded spec.zwaggen.json — ..."
pushToast("Downloaded spec.zwaggen.json — your in-app draft is preserved. Use 'Open' to re-attach the file as your editing source.", 'info', 8000);
```

Leave any OTHER `alert()` calls in AppHeader (e.g., `onDiscard` confirms) untouched. Scope is just the `saveSpec` block.

- [ ] **Step 2: Mount `<ToastList />` in App.tsx**

Import:
```ts
import { ToastList } from './ui/ToastList';
```

Render at the END of the App's JSX (next to `<LoadErrorModal>`, `<ExportPopover>`, etc.):
```tsx
<ToastList />
```

- [ ] **Step 3: Update AppHeader.save tests**

In `apps/web/tests/ui/AppHeader.save.test.tsx`, replace `vi.spyOn(window, 'alert')` patterns with toast-state assertions:

```ts
import { useToasts } from '../../src/state/toasts';

beforeEach(async () => {
  // ... existing setup ...
  useToasts.setState({ toasts: [] });
});

// in each test, after the click:
const ts = useToasts.getState().toasts;
expect(ts).toHaveLength(1);
expect(ts[0]?.kind).toBe('error');
expect(ts[0]?.message).toMatch(/Save failed.*quota exceeded/);
```

For the cancelled-picker test, assert `useToasts.getState().toasts` stays empty.

Drop the `vi.spyOn(window, 'alert').mockImplementation(...)` lines.

- [ ] **Step 4: Verify**

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

All green; full suite count up by the new toast tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/AppHeader.tsx apps/web/src/App.tsx apps/web/tests/ui/AppHeader.save.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): saveSpec uses non-blocking toasts instead of alert()

Three alert() calls in saveSpec migrate to pushToast: cannot-save
(broken refs), save-failed (writeFile error), and the downloaded-blob
fallback notice. Mounts <ToastList /> at the App root. Updated tests
assert via the toast store instead of spying on window.alert.

Other alert() calls outside saveSpec are unchanged for now.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `beforeunload` confirm when dirty

**Files:**
- Modify: `apps/web/src/App.tsx` — register the `beforeunload` listener.
- Create: `apps/web/tests/ui/App.beforeunload.test.tsx`

- [ ] **Step 1: Add the effect**

In `App.tsx`, near the other `useEffect`s:

```tsx
useEffect(() => {
  function handler(e: BeforeUnloadEvent) {
    if (!useSpecStore.getState().dirty) return;
    e.preventDefault();
    // Browsers ignore custom strings — assigning returnValue is the canonical opt-in.
    e.returnValue = '';
  }
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, []);
```

- [ ] **Step 2: Test**

```tsx
// apps/web/tests/ui/App.beforeunload.test.tsx
import 'fake-indexeddb/auto';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { App } from '../../src/App';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
});

it('beforeunload calls preventDefault when spec is dirty', async () => {
  render(<App />);
  // Dirty the spec
  await useSpecStore.getState().setSpec(emptySpec('Edited'));
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
  const preventSpy = vi.spyOn(event, 'preventDefault');
  window.dispatchEvent(event);
  expect(preventSpy).toHaveBeenCalled();
});

it('beforeunload is a no-op when spec is clean', async () => {
  render(<App />);
  // Spec is clean (replaceSpec sets dirty=false in beforeEach)
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
  const preventSpy = vi.spyOn(event, 'preventDefault');
  window.dispatchEvent(event);
  expect(preventSpy).not.toHaveBeenCalled();
});
```

(jsdom may not fully implement `BeforeUnloadEvent` — fallback: cast a `new Event('beforeunload')` and rely on the handler's runtime behavior. Adjust if the test fails.)

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter web test
pnpm --filter web lint

git add apps/web/src/App.tsx apps/web/tests/ui/App.beforeunload.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): beforeunload prompts when spec has unsaved edits

Registers a window-level beforeunload listener at the App shell.
When useSpecStore.dirty is true, calls preventDefault + sets
returnValue to opt into the browser's standard "Leave site?" prompt.
No-op when the spec is clean. Reads dirty imperatively from the
store so the listener never goes stale.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Move spec/plan + final smoke

**Files:**
- Move: spec + plan to `done/`.

This slice doesn't tick a TODO line.

- [ ] **Step 1: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-28-save-ux-polish.md docs/specs/done/
git mv docs/plans/active/2026-04-28-save-ux-polish.md docs/plans/done/
```

- [ ] **Step 2: Final smoke**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ship save-ux-polish — move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- Toast store + ToastList component land cleanly (~80 lines + tests).
- 3 `saveSpec` alerts replaced with `pushToast` (other alerts untouched).
- `<ToastList />` mounted in App.tsx.
- `beforeunload` handler registered in App.tsx; no-ops when clean.
- Updated AppHeader.save tests assert via toast store.
- New tests: toast store + ToastList component + beforeunload behavior.
- All tests + lint + build green.
- Spec + plan moved to `done/`.
- Branch ready to push (will be a force-push since `plan/save-data-loss-fix` already tracks origin).
