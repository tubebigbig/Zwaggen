import type { ParamDef } from '../schema/types';
import { TypeBuilder } from './TypeBuilder';
import { IconPlus, IconTrash } from './icons';

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
    <section className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="panel-title">{title}</h3>
        <button
          className="btn"
          onClick={() => onChange([...value, { name: '', required: true, type: { kind: 'string' } }])}
        >
          <IconPlus /> Add param
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-slate-400">None.</p>
      ) : (
        <div className="space-y-3">
          {value.map((p, i) => (
            <div key={i} className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
              <div className="mb-2 flex items-center gap-1.5">
                <input
                  aria-label="Param name"
                  placeholder="param name"
                  className="input min-w-0 flex-1 font-mono text-xs"
                  value={p.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
                <label
                  className={`flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition ${
                    p.required
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700'
                  }`}
                  title="Required"
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={p.required}
                    onChange={(e) => patch(i, { required: e.target.checked })}
                  />
                  <span aria-hidden="true">{p.required ? '✓' : '○'}</span>
                  required
                </label>
                <button
                  className="btn-icon shrink-0 text-red-600 hover:text-red-700"
                  aria-label={`remove-param-${i}`}
                  title="Remove"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <IconTrash />
                </button>
              </div>
              <TypeBuilder value={p.type} onChange={(t) => patch(i, { type: t })} typeNames={typeNames} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
