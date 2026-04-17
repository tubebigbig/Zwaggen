import type { ParamDef } from '../schema/types';
import { TypeBuilder } from './TypeBuilder';

interface Props {
  title: string;
  value: ParamDef[];
  onChange(next: ParamDef[]): void;
  typeNames: string[];
}

export function ParamTable({ title, value, onChange, typeNames }: Props) {
  const patch = (i: number, p: Partial<ParamDef>) => {
    const next = value.slice();
    const current = next[i];
    if (!current) return;
    next[i] = { ...current, ...p };
    onChange(next);
  };

  return (
    <section className="border rounded p-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <button
          className="rounded border px-2 py-0.5"
          onClick={() => onChange([...value, { name: '', required: true, type: { kind: 'string' } }])}
        >Add param</button>
      </div>
      <div className="space-y-2">
        {value.map((p, i) => (
          <div key={i} className="border-l-2 border-slate-200 pl-2">
            <div className="flex gap-2">
              <label className="flex items-center gap-1">
                <span>name</span>
                <input
                  aria-label="Param name"
                  className="border rounded px-1"
                  value={p.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />
                required
              </label>
              <button
                className="text-red-600"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >remove</button>
            </div>
            <TypeBuilder value={p.type} onChange={(t) => patch(i, { type: t })} typeNames={typeNames} />
          </div>
        ))}
      </div>
    </section>
  );
}
