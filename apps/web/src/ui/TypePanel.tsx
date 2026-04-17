import { useState } from 'react';
import { useSpecStore } from '../state/store';
import { TypeBuilder } from './TypeBuilder';
import { renameType, collectBrokenRefs } from '../schema/rename';

export function TypePanel() {
  const { spec, setSpec } = useSpecStore();
  const typeNames = Object.keys(spec.types).sort();
  const [selected, setSelected] = useState<string | null>(typeNames[0] ?? null);
  const broken = collectBrokenRefs(spec);

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
    <section className="border-r bg-white p-3 text-sm w-72">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Types</h2>
        <button className="rounded border px-2 py-0.5" onClick={() => void addType()}>+</button>
      </div>
      {broken.length > 0 && (
        <div role="alert" className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">
          {broken.length} broken ref(s):
          <ul>{broken.map((b, i) => <li key={i}>{b.location}: {b.ref}</li>)}</ul>
        </div>
      )}
      <ul className="mb-2 space-y-1">
        {typeNames.map((n) => (
          <li key={n} className={n === selected ? 'font-semibold' : ''}>
            <button className="text-left" onClick={() => setSelected(n)}>{n}</button>
          </li>
        ))}
      </ul>
      {selected && current && (
        <div>
          <div className="mb-2 flex gap-2">
            <input
              aria-label="Type name"
              className="border rounded px-1 flex-1"
              defaultValue={selected}
              onBlur={(e) => void rename(selected, e.target.value)}
            />
            <button className="text-red-600" onClick={() => void remove(selected)}>delete</button>
          </div>
          <TypeBuilder
            value={current}
            onChange={(t) => void setSpec({ ...spec, types: { ...spec.types, [selected]: t } })}
            typeNames={typeNames.filter((n) => n !== selected)}
          />
        </div>
      )}
    </section>
  );
}
