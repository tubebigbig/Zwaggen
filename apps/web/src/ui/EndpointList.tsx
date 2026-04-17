import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { IconChevronLeft, IconList, IconPlus } from './icons';
import { MethodBadge } from './MethodBadge';
import { setUiPref, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';

export function EndpointList() {
  const { t } = useTranslation();
  const { spec, setSpec } = useSpecStore();
  const selected = useSpecStore((s) => s.selectedEndpointId);
  const select = useSpecStore((s) => s.selectEndpoint);
  const { endpointsCollapsed } = useUiPrefs();

  if (endpointsCollapsed) {
    return (
      <CollapsedRail
        label={t('endpoints')}
        icon={<IconList />}
        side="left"
        onExpand={() => setUiPref('endpointsCollapsed', false)}
        count={spec.endpoints.length}
      />
    );
  }

  async function add() {
    const id = crypto.randomUUID();
    await setSpec({
      ...spec,
      endpoints: [...spec.endpoints, {
        id, method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      }],
    });
    select(id);
  }

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <h2 className="panel-title">{t('endpoints')}</h2>
        <div className="flex items-center gap-1">
          <button
            className="btn-icon"
            aria-label={t('newEndpoint')}
            title={t('newEndpoint')}
            onClick={() => void add()}
          >
            <IconPlus />
          </button>
          <button
            className="btn-icon"
            aria-label={t('collapseEndpoints')}
            title={t('collapse')}
            onClick={() => setUiPref('endpointsCollapsed', true)}
          >
            <IconChevronLeft />
          </button>
        </div>
      </div>
      {spec.endpoints.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <IconList />
          </div>
          <p className="text-xs text-slate-500">{t('noEndpointsYet')}</p>
          <p className="text-[11px] text-slate-400">{t('noEndpointsHint')}</p>
        </div>
      ) : (
        <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {spec.endpoints.map((e) => {
            const active = e.id === selected;
            return (
              <li key={e.id}>
                <button
                  className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                    active
                      ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200'
                      : 'hover:bg-slate-50'
                  }`}
                  onClick={() => select(e.id)}
                >
                  <MethodBadge method={e.method} />
                  <span className="truncate font-mono text-xs text-slate-700">{e.path}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
