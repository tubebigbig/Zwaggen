import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { TypeBuilder } from './TypeBuilder';
import { renameType, collectBrokenRefs, buildUsageIndex } from '../schema/rename';
import { IconAlert, IconCube, IconPlus, IconTrash, IconX } from './icons';
import { setUiPref, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';

export function TypePanel() {
  const { t } = useTranslation();
  const { spec, setSpec, selectEndpoint } = useSpecStore();
  const { typesCollapsed } = useUiPrefs();
  const typeNames = Object.keys(spec.types).sort();
  const [selected, setSelected] = useState<string | null>(typeNames[0] ?? null);
  const broken = collectBrokenRefs(spec);
  const usageIndex = useMemo(() => buildUsageIndex(spec), [spec]);
  const usages = selected ? (usageIndex[selected] ?? []) : [];

  useEffect(() => {
    if (typesCollapsed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setUiPref('typesCollapsed', true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typesCollapsed]);

  async function addType() {
    let name = 'NewType';
    let i = 1;
    while (spec.types[name]) name = `NewType${i++}`;
    await setSpec({ ...spec, types: { ...spec.types, [name]: { kind: 'object', fields: [] } } });
    setSelected(name);
  }

  async function rename(oldName: string, newName: string) {
    if (!newName || spec.types[newName]) return;
    await setSpec(renameType(spec, oldName, newName));
    setSelected(newName);
  }

  async function remove(name: string) {
    if ((usageIndex[name] ?? []).length > 0) return;
    const { [name]: _, ...rest } = spec.types;
    await setSpec({ ...spec, types: rest });
    if (selected === name) setSelected(Object.keys(rest)[0] ?? null);
  }

  const current = selected ? spec.types[selected] : null;

  return (
    <>
      <CollapsedRail
        label={t('types')}
        icon={<IconCube />}
        side="left"
        onExpand={() => setUiPref('typesCollapsed', false)}
        count={typeNames.length}
      />

      {!typesCollapsed && (
        <>
          <div
            className="absolute inset-0 z-20 bg-slate-900/10"
            onClick={() => setUiPref('typesCollapsed', true)}
            aria-hidden="true"
          />
          <section
            className="absolute left-10 top-0 bottom-0 z-30 flex w-[440px] max-w-[calc(100vw-4rem)] flex-col rounded-r-lg border-y border-r border-slate-200 bg-white shadow-pop text-sm"
            role="dialog"
            aria-label={t('types')}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <h2 className="panel-title">{t('types')}</h2>
              <div className="flex items-center gap-1">
                <button
                  className="btn-icon"
                  aria-label={t('addTypeTitle')}
                  title={t('addTypeTitle')}
                  onClick={() => void addType()}
                >
                  <IconPlus />
                </button>
                <button
                  className="btn-icon"
                  aria-label={t('closeTypes')}
                  title={t('closeTypesHint')}
                  onClick={() => setUiPref('typesCollapsed', true)}
                >
                  <IconX />
                </button>
              </div>
            </div>

            <div className="thin-scroll flex-1 overflow-y-auto p-3">
              {broken.length > 0 && (
                <div role="alert" className="mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  <IconAlert className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">{broken.length} {t('brokenRefs')}</div>
                    <ul className="mt-1 space-y-0.5">
                      {broken.map((b, i) => (
                        <li key={i}><span className="font-mono">{b.location}</span>: {b.ref}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {typeNames.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <IconCube />
                  </div>
                  <p className="text-xs text-slate-500">{t('noTypesYet')}</p>
                  <p className="text-[11px] text-slate-400">{t('noTypesHint')}</p>
                </div>
              ) : (
                <ul className="mb-3 space-y-0.5">
                  {typeNames.map((n) => {
                    const active = n === selected;
                    return (
                      <li key={n}>
                        <button
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition ${
                            active
                              ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                          onClick={() => setSelected(n)}
                        >
                          <IconCube className="text-slate-400" />
                          <span className="truncate font-mono text-xs">{n}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {selected && current && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      aria-label="Type name"
                      className="input flex-1 font-mono text-xs"
                      defaultValue={selected}
                      onBlur={(e) => void rename(selected, e.target.value)}
                    />
                    <button
                      className="btn-icon text-red-600 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
                      aria-label="delete"
                      title={
                        usages.length > 0
                          ? t('deleteTypeBlocked', { count: usages.length })
                          : t('deleteType')
                      }
                      disabled={usages.length > 0}
                      onClick={() => void remove(selected)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                  {usages.length > 0 && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      <div className="mb-1 font-medium text-slate-600">
                        {t('referencedBy', { count: usages.length })}
                      </div>
                      <ul className="space-y-0.5" aria-label={t('referencedBy', { count: usages.length })}>
                        {usages.map((u) => {
                          const key = u.kind === 'endpoint'
                            ? `ep:${u.endpointId}:${u.label}`
                            : `ty:${u.typeName}:${u.label}`;
                          return (
                          <li key={key}>
                            <button
                              className="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] text-slate-700 hover:bg-white hover:text-brand-700"
                              onClick={() => {
                                if (u.kind === 'endpoint') {
                                  selectEndpoint(u.endpointId);
                                  setUiPref('typesCollapsed', true);
                                } else {
                                  setSelected(u.typeName);
                                }
                              }}
                            >
                              {u.label}
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <TypeBuilder
                    value={current}
                    onChange={(t2) => void setSpec({ ...spec, types: { ...spec.types, [selected]: t2 } })}
                    typeNames={typeNames.filter((n) => n !== selected)}
                  />
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
