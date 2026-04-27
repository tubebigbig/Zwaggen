import type { ReactNode, MouseEvent } from 'react';

interface Props {
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}

export function MenuItem({ onClick, disabled, danger, children }: Props) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm',
        'hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        danger ? 'text-red-700' : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
