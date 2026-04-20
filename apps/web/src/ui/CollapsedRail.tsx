import type { ReactNode, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  label: string;
  icon: ReactNode;
  side: 'left' | 'right';
  onExpand(): void;
  count?: number;
}

// CJK characters render upright in vertical-rl, so no rotation or uppercase.
// Latin scripts render sideways in vertical-rl, so rotate 180° to read bottom-to-top.
const CJK_RE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

export function CollapsedRail({ label, icon, side, onExpand, count }: Props) {
  const { t } = useTranslation();
  const borderClass = side === 'left' ? 'border-r' : 'border-l';
  const isCJK = CJK_RE.test(label);
  const labelStyle: CSSProperties = isCJK
    ? { writingMode: 'vertical-rl' }
    : { writingMode: 'vertical-rl', transform: 'rotate(180deg)' };
  const labelClass = isCJK
    ? 'text-[11px] font-semibold tracking-wider'
    : 'text-[11px] font-semibold uppercase tracking-wider';
  const expandLabel = t('expand', { name: label });
  return (
    <button
      aria-label={expandLabel}
      title={expandLabel}
      onClick={onExpand}
      className={`group flex w-10 flex-col items-center gap-3 bg-white py-3 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 ${borderClass} border-slate-200`}
    >
      <span className="text-slate-400 group-hover:text-brand-600">{icon}</span>
      <span className={labelClass} style={labelStyle}>
        {label}
      </span>
      {count != null && count > 0 && (
        <span className="chip bg-slate-100 text-slate-600">{count}</span>
      )}
    </button>
  );
}
