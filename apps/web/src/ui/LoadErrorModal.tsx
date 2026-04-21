import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconX } from './icons';

interface LoadErrorModalProps {
  filename: string;
  message: string;
  onClose(): void;
}

export function LoadErrorModal({ filename, message, onClose }: LoadErrorModalProps) {
  const { t } = useTranslation();
  const dismissRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dismissRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-error-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="load-error-title" className="text-sm font-semibold">
            {t('loadErrorTitle')}
          </h2>
          <button className="btn-icon" aria-label={t('dismiss')} onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto p-4 text-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-slate-600">{t('loadErrorFilenameLabel')}</span>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{filename}</code>
          </div>
          <pre className="mb-3 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
            {message}
          </pre>
          <a
            href="https://github.com/tubebigbig/Zwaggen/blob/main/docs/rules/spec-versioning.md"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand-600 hover:underline"
          >
            {t('loadErrorLearnMore')}
          </a>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-4 py-3">
          <button ref={dismissRef} className="btn" onClick={onClose}>
            {t('dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
