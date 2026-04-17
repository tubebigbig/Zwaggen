import type { ReactNode } from 'react';

interface Props {
  label: string;
  icon: ReactNode;
  side: 'left' | 'right';
  onExpand(): void;
  count?: number;
}

export function CollapsedRail({ label, icon, side, onExpand, count }: Props) {
  const borderClass = side === 'left' ? 'border-r' : 'border-l';
  return (
    <button
      aria-label={`Expand ${label}`}
      title={`Expand ${label}`}
      onClick={onExpand}
      className={`group flex w-10 flex-col items-center gap-3 bg-white py-3 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 ${borderClass} border-slate-200`}
    >
      <span className="text-slate-400 group-hover:text-brand-600">{icon}</span>
      <span
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {label}
      </span>
      {count != null && count > 0 && (
        <span className="chip bg-slate-100 text-slate-600">{count}</span>
      )}
    </button>
  );
}
