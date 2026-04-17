import type { HttpMethod } from '../schema/types';

const COLORS: Record<HttpMethod, string> = {
  GET: 'bg-method-get',
  POST: 'bg-method-post',
  PUT: 'bg-method-put',
  PATCH: 'bg-method-patch',
  DELETE: 'bg-method-delete',
  HEAD: 'bg-method-head',
  OPTIONS: 'bg-method-options',
};

export function MethodBadge({ method, size = 'sm' }: { method: HttpMethod; size?: 'sm' | 'md' }) {
  const dims = size === 'md' ? 'h-6 min-w-[54px] text-[11px]' : 'h-5 min-w-[44px] text-[10px]';
  return (
    <span className={`method-badge ${COLORS[method]} ${dims}`}>{method}</span>
  );
}
