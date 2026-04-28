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

// Convenience exports for non-React callers (e.g. event handlers)
export const pushToast = (m: string, k?: ToastKind, d?: number) => useToasts.getState().pushToast(m, k, d);
export const dismissToast = (id: string) => useToasts.getState().dismissToast(id);
