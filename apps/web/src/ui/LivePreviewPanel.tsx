import { useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { generateTs, generateZod, generateClient, toOpenApi, type Spec } from '@zwaggen/core';
import { useSpecStore } from '../state/store';
import { setUiPref } from '../state/uiPrefs';
import { useDebounce } from '../hooks/useDebounce';
import { IconX } from './icons';

interface PreviewTab {
  id: string;
  label: string;
  output: string;
  filename: string;
  isError: boolean;
}

export function LivePreviewPanel() {
  const { t } = useTranslation();
  const spec = useSpecStore((s) => s.spec);
  const debouncedSpec = useDebounce(spec, 300);
  const tabs: PreviewTab[] = useMemo(() => buildPreviewTabs(debouncedSpec, t), [debouncedSpec, t]);
  const [activeId, setActiveId] = useState<string>(tabs[0]?.id ?? '');
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <aside
      role="complementary"
      aria-label={t('livePreview')}
      className="thin-scroll flex w-96 flex-col overflow-hidden border-l border-slate-200 bg-slate-50"
    >
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
        <h2 className="panel-title">{t('livePreview')}</h2>
        <button
          className="btn-icon"
          aria-label={t('dismiss')}
          onClick={() => setUiPref('livePreviewOpen', false)}
        >
          <IconX />
        </button>
      </header>
      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 border-b border-slate-200 px-2 py-1.5">
          {tabs.map((tab) => {
            const isActive = tab.id === active?.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(tab.id)}
                className={`rounded px-2 py-1 text-xs ${isActive ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      {active && <PreviewPane key={active.id} tab={active} />}
    </aside>
  );
}

function PreviewPane({ tab }: { tab: PreviewTab }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tab.output);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
      setCopyFailed(true);
    }
  }

  function download() {
    const blob = new Blob([tab.output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs">
        <button type="button" onClick={copy} className="btn">
          {copied ? t('copied') : t('copyOutput')}
        </button>
        <button type="button" onClick={download} className="btn">
          {t('downloadOutput')}
        </button>
        {copyFailed && <span className="text-amber-700">{t('copyFallbackHint')}</span>}
        <span className="ml-auto font-mono text-slate-500">{tab.filename}</span>
      </div>
      <pre
        className={`thin-scroll flex-1 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs ${
          tab.isError ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-800'
        }`}
      >
        {tab.output}
      </pre>
      <textarea
        ref={fallbackRef}
        value={tab.output}
        readOnly
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function buildPreviewTabs(spec: Spec, t: TFunction): PreviewTab[] {
  const safe = (label: string, filename: string, fn: () => string): PreviewTab => {
    try {
      return { id: filename, label, output: fn(), filename, isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        id: filename,
        label,
        output: `${t('livePreviewError')}\n\n${message}`,
        filename,
        isError: true,
      };
    }
  };
  return [
    safe(t('exportTabTypes'), 'types.ts', () => generateTs(spec)),
    safe(t('exportTabSchemas'), 'schemas.ts', () => generateZod(spec)),
    safe(t('exportTabClient'), 'client.ts', () => generateClient(spec)),
    safe(t('exportTabOpenApi'), 'openapi.json', () =>
      JSON.stringify(toOpenApi(spec) as unknown, null, 2),
    ),
  ];
}
