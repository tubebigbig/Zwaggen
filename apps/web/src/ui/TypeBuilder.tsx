import { TypeDef, ObjectField } from '../schema/types';

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
    <div className="rounded border p-2 text-sm">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          <span>Kind</span>
          <select
            aria-label="Kind"
            value={value.kind}
            onChange={(e) => onChange(defaultFor(e.target.value as TypeDef['kind'], typeNames))}
            className="border rounded px-1"
          >
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span>desc</span>
          <input
            aria-label="description"
            className="border rounded px-1"
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
    <label className="flex items-center gap-1">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={v ?? ''}
        onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
        className="border rounded px-1 w-20"
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
      <label className="flex items-center gap-1">
        <span>pattern</span>
        <input
          aria-label="pattern"
          className="border rounded px-1"
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

function EnumField({ value, onChange, parse }: { value: string[]; onChange(v: string[]): void; parse: (s: string) => unknown }) {
  return (
    <label className="flex items-center gap-1">
      <span>enum</span>
      <input
        aria-label="enum"
        placeholder="comma-separated"
        className="border rounded px-1"
        value={value.join(',')}
        onChange={(e) => onChange(e.target.value ? e.target.value.split(',').map((s) => s.trim()) : [])}
      />
    </label>
  );
}

function ArrayControls({ value, onChange, typeNames }: any) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        {numInput('min items', value.minItems, (n) => onChange({ ...value, minItems: n }))}
        {numInput('max items', value.maxItems, (n) => onChange({ ...value, maxItems: n }))}
      </div>
      <div>
        <div className="text-xs text-slate-500">element</div>
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
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={!!value.strict}
          onChange={(e) => onChange({ ...value, strict: e.target.checked || undefined })}
        />
        strict (fail on unknown fields)
      </label>
      {value.fields.map((f: ObjectField, i: number) => (
        <div key={i} className="border-l-2 border-slate-200 pl-2 space-y-1">
          <div className="flex gap-2">
            <label className="flex items-center gap-1">
              <span>name</span>
              <input
                aria-label="Field name"
                className="border rounded px-1"
                value={f.name}
                onChange={(e) => setField(i, { name: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => setField(i, { required: e.target.checked })}
              />
              required
            </label>
            <button
              className="text-red-600"
              onClick={() => onChange({ ...value, fields: value.fields.filter((_: unknown, j: number) => j !== i) })}
            >remove</button>
          </div>
          <TypeBuilder value={f.type} onChange={(t) => setField(i, { type: t })} typeNames={typeNames} />
        </div>
      ))}
      <button
        className="rounded border px-2 py-1"
        onClick={() => onChange({ ...value, fields: [...value.fields, { name: '', required: true, type: { kind: 'string' } }] })}
      >Add field</button>
    </div>
  );
}

function UnionControls({ value, onChange, typeNames }: any) {
  return (
    <div className="mt-2 space-y-2">
      {value.variants.map((v: any, i: number) => (
        <div key={i} className="flex gap-2">
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
            className="text-red-600"
            onClick={() => onChange({ ...value, variants: value.variants.filter((_: unknown, j: number) => j !== i) })}
          >remove</button>
        </div>
      ))}
      <button
        className="rounded border px-2 py-1"
        onClick={() => onChange({ ...value, variants: [...value.variants, { kind: 'string' }] })}
      >Add variant</button>
    </div>
  );
}

function LiteralControls({ value, onChange }: any) {
  return (
    <label className="mt-2 flex items-center gap-1">
      <span>value</span>
      <input
        aria-label="literal value"
        className="border rounded px-1"
        value={String(value.value)}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </label>
  );
}

function RefControls({ value, onChange, typeNames }: any) {
  return (
    <label className="mt-2 flex items-center gap-1">
      <span>ref</span>
      <select
        aria-label="ref"
        className="border rounded px-1"
        value={value.ref}
        onChange={(e) => onChange({ ref: e.target.value })}
      >
        {typeNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
