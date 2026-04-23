import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fromJSON } from '@zwaggen/core';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { EndpointList } from './ui/EndpointList';
import { EndpointEditor } from './ui/EndpointEditor';
import { EnvEditor } from './ui/EnvEditor';
import { AuthEditor } from './ui/AuthEditor';
import { SpecInfoEditor } from './ui/SpecInfoEditor';
import { LoadErrorModal } from './ui/LoadErrorModal';
import { useSpecStore } from './state/store';
import { resolveBootIntent } from './state/boot';
import { getStorage, type FileRef } from './storage/spec-storage';
import { IconChevronRight, IconFile, IconGlobe, IconLock, IconPanelRight } from './ui/icons';
import { setUiPref, useUiPrefs } from './state/uiPrefs';
import { CollapsedRail } from './ui/CollapsedRail';
import { useBreakpoint } from './hooks/useBreakpoint';

export function App() {
  const { t } = useTranslation();
  const { spec, setSpec, restoreDraft, replaceSpec } = useSpecStore();
  const [bootError, setBootError] = useState<{ filename: string; message: string } | null>(null);
  const { sidebarCollapsed } = useUiPrefs();
  const isWide = useBreakpoint('(min-width: 1200px)');
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const intent = resolveBootIntent();
      if (intent.kind === 'none') {
        await restoreDraft();
        return;
      }
      try {
        let text: string;
        let handle: FileRef | null = null;
        if (intent.kind === 'load-url') {
          const resp = await fetch(intent.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
          text = await resp.text();
        } else {
          const opened = await getStorage().openByPath(intent.path);
          if (!opened) throw new Error('openByPath returned null');
          text = opened.text;
          handle = opened.handle;
        }
        const parsed = fromJSON(JSON.parse(text));
        if (cancelled) return;
        await replaceSpec(parsed, handle);
        if (cancelled) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('spec');
        url.searchParams.delete('specPath');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (err) {
        if (cancelled) return;
        const filename = intent.kind === 'load-url' ? intent.url : intent.path;
        setBootError({ filename, message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [restoreDraft, replaceSpec]);

  useEffect(() => {
    if (!overlayOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOverlayOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen]);

  useEffect(() => { if (isWide) setOverlayOpen(false); }, [isWide]);

  const pinned = isWide && !sidebarCollapsed;
  const showRail = !pinned;

  const settingsBody = (
    <div className="flex flex-col gap-3 p-3">
      <section className="card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <IconFile className="text-slate-500" />
          <h2 className="panel-title">{t('apiInfo')}</h2>
        </div>
        <SpecInfoEditor />
      </section>
      <section className="card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <IconGlobe className="text-slate-500" />
          <h2 className="panel-title">{t('environment')}</h2>
        </div>
        <EnvEditor />
      </section>
      <section className="card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <IconLock className="text-slate-500" />
          <h2 className="panel-title">{t('defaultAuth')}</h2>
        </div>
        <AuthEditor
          value={spec.auth}
          onChange={(auth) => void setSpec({ ...spec, auth })}
        />
        <label className="mt-3 flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={spec.useProxyDefault}
            onChange={(e) => void setSpec({ ...spec, useProxyDefault: e.target.checked })}
          />
          {t('useProxyDefault')}
        </label>
      </section>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <AppHeader />
      <div className="relative flex flex-1 overflow-hidden">
        <TypePanel />
        <EndpointList />
        <EndpointEditor />

        {pinned && (
          <aside className="thin-scroll flex w-80 flex-col overflow-y-auto border-l border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
              <h2 className="panel-title">{t('settings')}</h2>
              <button
                className="btn-icon"
                aria-label={t('collapseSidebar')}
                title={t('collapse')}
                onClick={() => setUiPref('sidebarCollapsed', true)}
              >
                <IconChevronRight />
              </button>
            </div>
            {settingsBody}
          </aside>
        )}

        {showRail && (
          <CollapsedRail
            label={t('environment')}
            icon={<IconPanelRight />}
            side="right"
            onExpand={() => {
              if (isWide) setUiPref('sidebarCollapsed', false);
              else setOverlayOpen(true);
            }}
          />
        )}

        {!isWide && overlayOpen && (
          <>
            <div
              className="absolute inset-0 z-20 bg-slate-900/10"
              onClick={() => setOverlayOpen(false)}
              aria-hidden="true"
            />
            <aside
              role="complementary"
              aria-label={t('settings')}
              className="thin-scroll absolute right-10 top-0 bottom-0 z-30 flex w-80 flex-col overflow-y-auto rounded-l-lg border-y border-l border-slate-200 bg-slate-50 shadow-pop"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
                <h2 className="panel-title">{t('settings')}</h2>
                <button
                  className="btn-icon"
                  aria-label={t('collapseSidebar')}
                  title={t('collapse')}
                  onClick={() => setOverlayOpen(false)}
                >
                  <IconChevronRight />
                </button>
              </div>
              {settingsBody}
            </aside>
          </>
        )}
      </div>
      {bootError && (
        <LoadErrorModal
          filename={bootError.filename}
          message={bootError.message}
          onClose={() => setBootError(null)}
        />
      )}
    </div>
  );
}
