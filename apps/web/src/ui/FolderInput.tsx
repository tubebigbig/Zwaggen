import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeFolder } from '@zwaggen/core';

interface Props {
  value: string | undefined;
  onChange(next: string | undefined): void;
  /** If provided, overrides the default 'Folder' aria-label. */
  labelText?: string;
  className?: string;
}

export function FolderInput({ value, onChange, labelText, className }: Props) {
  const { t } = useTranslation();
  const [buffer, setBuffer] = useState<string>(value ?? '');
  const [error, setError] = useState<string | null>(null);
  // When Escape is pressed we revert synchronously via this ref so that
  // the onBlur handler triggered by the subsequent .blur() call does not
  // attempt to commit the pre-revert value.
  const skipNextCommit = useRef(false);

  useEffect(() => {
    setBuffer(value ?? '');
    setError(null);
  }, [value]);

  function commit() {
    if (skipNextCommit.current) {
      skipNextCommit.current = false;
      return;
    }
    const result = normalizeFolder(buffer);
    if (result === null) {
      setError(t('folderInvalid'));
      return;
    }
    setError(null);
    if (result !== value) onChange(result);
    setBuffer(result ?? '');
  }

  return (
    <div className={className}>
      <label className="block">
        <span className="text-xs text-slate-500">{labelText ?? t('folder')}</span>
        <input
          aria-label={labelText ?? t('folder')}
          className="input mt-1 font-mono text-xs"
          placeholder={t('folderPlaceholder')}
          value={buffer}
          onChange={(e) => { setBuffer(e.target.value); if (error) setError(null); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') {
              e.preventDefault();
              skipNextCommit.current = true;
              setBuffer(value ?? '');
              setError(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </label>
      {error && (
        <div role="alert" className="mt-1 text-[11px] text-red-600">{error}</div>
      )}
    </div>
  );
}
