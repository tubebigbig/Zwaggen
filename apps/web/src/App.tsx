import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { EndpointList } from './ui/EndpointList';
import { EndpointEditor } from './ui/EndpointEditor';
import { EnvEditor } from './ui/EnvEditor';
import { AuthEditor } from './ui/AuthEditor';
import { useSpecStore } from './state/store';
import { IconChevronRight, IconGlobe, IconLock, IconPanelRight } from './ui/icons';
import { setUiPref, useUiPrefs } from './state/uiPrefs';
import { CollapsedRail } from './ui/CollapsedRail';

export function App() {
  const { t } = useTranslation();
  const { spec, setSpec, restoreDraft } = useSpecStore();
  const { sidebarCollapsed } = useUiPrefs();
  useEffect(() => { void restoreDraft(); }, [restoreDraft]);
  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <AppHeader />
      <div className="relative flex flex-1 overflow-hidden">
        <TypePanel />
        <EndpointList />
        <EndpointEditor />
        {sidebarCollapsed ? (
          <CollapsedRail
            label={t('environment')}
            icon={<IconPanelRight />}
            side="right"
            onExpand={() => setUiPref('sidebarCollapsed', false)}
          />
        ) : (
          <aside className="thin-scroll flex w-80 flex-col overflow-y-auto border-l border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
              <h2 className="panel-title">{t('settings')}</h2>
              <button
                className="btn-icon"
                aria-label="Collapse sidebar"
                title={t('collapse')}
                onClick={() => setUiPref('sidebarCollapsed', true)}
              >
                <IconChevronRight />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-3">
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
          </aside>
        )}
      </div>
    </div>
  );
}
