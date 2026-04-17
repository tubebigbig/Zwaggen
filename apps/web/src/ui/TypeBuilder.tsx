import { TypeDef, ObjectField } from '../schema/types';
import { IconPlus, IconTrash } from './icons';

const KINDS: Array<TypeDef['kind']> = [
  'string','number','integer','boolean','null','literal','array','object','union','ref',
];

function defaultFor(kind: TypeDef['kind'], typeNames: string[]): TypeDef {
  switch (kind) {
    case 'string': return { kind: 'string' };
    case 'number': return { kind: 'number' };
    case 'integer': return { kind: 'integer' };
    case 'boolean': return { kind: 'boolean' };
    case 'null': return { kind: 'null' };
    case 'literal': return { kind: 'literal', value: '' };
    case 'array': return { kind: 'array', element: { kind: 'string' } };
    case 'object': return { kind: 'object', fields: [] };
    case 'union': return { kind: 'union', variants: [{ kind: 'string' }] };
    case 'ref': return { kind: 'ref', ref: typeNames[0] ?? '' };
  }
}

interface Props {
  value: TypeDef;
  onChange(next: TypeDef): void;
  typeNames: string[];
}

export function TypeBuilder({ value, onChange, typeNames }: Props) {
  const patch = (p: Partial<TypeDef>) => onChange({ ...(value as any), ...p });

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2 text-sm">
      <div className="flex flex-col flex-wrap gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Kind</span>
          <select
            aria-label="Kind"
            value={value.kind}
            onChange={(e) => onChange(defaultFor(e.target.value as TypeDef['kind'], typeNames))}
            className="select text-xs"
          >
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="flex flex-1 items-center gap-1.5">
          <span className="text-xs text-slate-500">desc</span>
          <input
            aria-label="description"
            className="input text-xs"
            value={value.description ?? ''}
            onChange={(e) => patch({ description: e.target.value || undefined } as any)}
          />
        </label>
      </div>

      {value.kind === 'string' && (
        <StringConstraints value={value} onChange={patch as any} />
      )}
      {(value.kind === 'number' || value.kind === 'integer') && (
        <NumberConstraints value={value} onChange={patch as any} />
      )}
      {value.kind === 'array' && (
        <ArrayControls value={value} onChange={onChange} typeNames={typeNames} />
      )}
      {value.kind === 'object' && (
        <ObjectControls value={value} onChange={onChange} typeNames={typeNames} />
      )}
      {value.kind === 'union' && (
        <UnionControls value={value} onChange={onChange} typeNames={typeNames} />
      )}
      {value.kind === 'literal' && (
        <LiteralControls value={value} onChange={patch as any} />
      )}
      {value.kind === 'ref' && (
        <RefControls value={value} onChange={patch as any} typeNames={typeNames} />
      )}
    </div>
  );
}

function numInput(label: string, v: number | undefined, set: (n?: number) => void) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <input
        aria-label={label}
        type="number"
        value={v ?? ''}
        onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
        className="input w-20 font-mono text-xs"
      />
    </label>
  );
}

function StringConstraints({ value, onChange }: any) {
  const v = value;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {numInput('min length', v.minLength, (n) => onChange({ minLength: n }))}
      {numInput('max length', v.maxLength, (n) => onChange({ maxLength: n }))}
      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">pattern</span>
        <input
          aria-label="pattern"
          className="input w-40 font-mono text-xs"
          value={v.pattern ?? ''}
          onChange={(e) => onChange({ pattern: e.target.value || undefined })}
        />
      </label>
      <EnumField value={v.enum ?? []} onChange={(e) => onChange({ enum: e.length ? e : undefined })} parse={(s) => s} />
    </div>
  );
}

function NumberConstraints({ value, onChange }: any) {
  const v = value;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {numInput('min', v.min, (n) => onChange({ min: n }))}
      {numInput('max', v.max, (n) => onChange({ max: n }))}
      <EnumField
        value={(v.enum ?? []).map(String)}
        onChange={(e) => onChange({ enum: e.length ? e.map(Number) : undefined })}
        parse={(s) => Number(s)}
      />
    </div>
  );
}

function EnumField({ value, onChange }: { value: string[]; onChange(v: string[]): void; parse: (s: string) => unknown }) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">enum</span>
      <input
        aria-label="enum"
        placeholder="comma-separated"
        className="input w-48 font-mono text-xs"
        value={value.join(',')}
        onChange={(e) => onChange(e.target.value ? e.target.value.split(',').map((s) => s.trim()) : [])}
      />
    </label>
  );
}

function ArrayControls({ value, onChange, typeNames }: any) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {numInput('min items', value.minItems, (n) => onChange({ ...value, minItems: n }))}
        {numInput('max items', value.maxItems, (n) => onChange({ ...value, maxItems: n }))}
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">element</div>
        <TypeBuilder
          value={value.element}
          onChange={(el) => onChange({ ...value, element: el })}
          typeNames={typeNames}
        />
      </div>
    </div>
  );
}

function ObjectControls({ value, onChange, typeNames }: any) {
  const setField = (i: number, patch: Partial<ObjectField>) => {
    const next = value.fields.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, fields: next });
  };
  return (
    <div className="mt-2 space-y-2">
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={!!value.strict}
          onChange={(e) => onChange({ ...value, strict: e.target.checked || undefined })}
        />
        strict <span className="text-slate-400">(fail on unknown fields)</span>
      </label>
      {value.fields.map((f: ObjectField, i: number) => (
        <div key={i} className="rounded-md border border-slate-200 bg-slate-50/60 p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              aria-label="Field name"
              placeholder="field name"
              className="input min-w-0 flex-1 font-mono text-xs"
              value={f.name}
              onChange={(e) => setField(i, { name: e.target.value })}
            />
            <label
              className={`flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition ${
                f.required
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700'
              }`}
              title="Required"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={f.required}
                onChange={(e) => setField(i, { required: e.target.checked })}
              />
              <span aria-hidden="true">{f.required ? '✓' : '○'}</span>
              required
            </label>
            <button
              className="btn-icon shrink-0 text-red-600 hover:text-red-700"
              aria-label={`remove-field-${i}`}
              title="Remove field"
              onClick={() => onChange({ ...value, fields: value.fields.filter((_: unknown, j: number) => j !== i) })}
            >
              <IconTrash />
            </button>
          </div>
          <TypeBuilder value={f.type} onChange={(t) => setField(i, { type: t })} typeNames={typeNames} />
        </div>
      ))}
      <button
        className="btn"
        onClick={() => onChange({ ...value, fields: [...value.fields, { name: '', required: true, type: { kind: 'string' } }] })}
      >
        <IconPlus /> Add field
      </button>
    </div>
  );
}

function UnionControls({ value, onChange, typeNames }: any) {
  return (
    <div className="mt-2 space-y-2">
      {value.variants.map((v: any, i: number) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <TypeBuilder
              value={v}
              onChange={(next) => {
                const variants = value.variants.slice();
                variants[i] = next;
                onChange({ ...value, variants });
              }}
              typeNames={typeNames}
            />
          </div>
          <button
            className="btn-icon mt-0.5 text-red-600 hover:text-red-700"
            aria-label={`remove-variant-${i}`}
            title="Remove variant"
            onClick={() => onChange({ ...value, variants: value.variants.filter((_: unknown, j: number) => j !== i) })}
          >
            <IconTrash />
          </button>
        </div>
      ))}
      <button
        className="btn"
        onClick={() => onChange({ ...value, variants: [...value.variants, { kind: 'string' }] })}
      >
        <IconPlus /> Add variant
      </button>
    </div>
  );
}

function LiteralControls({ value, onChange }: any) {
  return (
    <label className="mt-2 flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">value</span>
      <input
        aria-label="literal value"
        className="input font-mono text-xs"
        value={String(value.value)}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </label>
  );
}

function RefControls({ value, onChange, typeNames }: any) {
  return (
    <label className="mt-2 flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">ref</span>
      <select
        aria-label="ref"
        className="select text-xs"
        value={value.ref}
        onChange={(e) => onChange({ ref: e.target.value })}
      >
        {typeNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
