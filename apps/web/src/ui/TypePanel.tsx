import { useEffect, useState } from 'react';
import { useSpecStore } from '../state/store';
import { TypeBuilder } from './TypeBuilder';
import { renameType, collectBrokenRefs } from '../schema/rename';
import { IconAlert, IconCube, IconPlus, IconTrash, IconX } from './icons';
import { setUiPref, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';

export function TypePanel() {
  const { spec, setSpec } = useSpecStore();
  const { typesCollapsed } = useUiPrefs();
  const typeNames = Object.keys(spec.types).sort();
  const [selected, setSelected] = useState<string | null>(typeNames[0] ?? null);
  const broken = collectBrokenRefs(spec);

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
    const { [name]: _, ...rest } = spec.types;
    await setSpec({ ...spec, types: rest });
    if (selected === name) setSelected(Object.keys(rest)[0] ?? null);
  }

  const current = selected ? spec.types[selected] : null;

  return (
    <>
      <CollapsedRail
        label="Types"
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
            aria-label="Types"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <h2 className="panel-title">Types</h2>
              <div className="flex items-center gap-1">
                <button
                  className="btn-icon"
                  aria-label="Add type"
                  title="Add type"
                  onClick={() => void addType()}
                >
                  <IconPlus />
                </button>
                <button
                  className="btn-icon"
                  aria-label="Close types"
                  title="Close (Esc)"
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
                    <div className="font-semibold">{broken.length} broken ref(s)</div>
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
                  <p className="text-xs text-slate-500">No types defined.</p>
                  <p className="text-[11px] text-slate-400">Add one to reuse across endpoints.</p>
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
                      className="btn-icon text-red-600 hover:text-red-700"
                      aria-label="delete"
                      title="Delete type"
                      onClick={() => void remove(selected)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                  <TypeBuilder
                    value={current}
                    onChange={(t) => void setSpec({ ...spec, types: { ...spec.types, [selected]: t } })}
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
