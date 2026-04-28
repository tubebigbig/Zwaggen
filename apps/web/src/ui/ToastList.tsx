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
