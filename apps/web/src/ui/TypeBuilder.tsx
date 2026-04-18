import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TypeDef, ObjectField, ObjectType, ArrayType } from '../schema/types';
import { IconPlus, IconTrash } from './icons';

const KINDS: Array<TypeDef['kind']> = [
  'string','number','integer','boolean','null','literal','array','object','union','ref',
];

function defaultFor(kind: TypeDef['kind'], typeNames: string[]): TypeDef {
  switch (kind) {
    case 'string':  return { kind: 'string' };
    case 'number':  return { kind: 'number' };
    case 'integer': return { kind: 'integer' };
    case 'boolean': return { kind: 'boolean' };
    case 'null':    return { kind: 'null' };
    case 'literal': return { kind: 'literal', value: '' };
    case 'array':   return { kind: 'array', element: { kind: 'string' } };
    case 'object':  return { kind: 'object', fields: [] };
    case 'union':   return { kind: 'union', variants: [{ kind: 'string' }] };
    case 'ref':     return { kind: 'ref', ref: typeNames[0] ?? '' };
  }
}

/** One-line badge showing a type kind at a glance. */
function KindBadge({ kind }: { kind: TypeDef['kind'] }) {
  const colours: Record<TypeDef['kind'], string> = {
    string:  'bg-emerald-50 text-emerald-700 ring-emerald-200',
    number:  'bg-blue-50 text-blue-700 ring-blue-200',
    integer: 'bg-blue-50 text-blue-700 ring-blue-200',
    boolean: 'bg-purple-50 text-purple-700 ring-purple-200',
    null:    'bg-slate-100 text-slate-500 ring-slate-200',
    literal: 'bg-amber-50 text-amber-700 ring-amber-200',
    array:   'bg-sky-50 text-sky-700 ring-sky-200',
    object:  'bg-orange-50 text-orange-700 ring-orange-200',
    union:   'bg-rose-50 text-rose-700 ring-rose-200',
    ref:     'bg-violet-50 text-violet-700 ring-violet-200',
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${colours[kind]}`}>
      {kind}
    </span>
  );
}

/** Chevron icon, rotatable. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 text-slate-400 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  value: TypeDef;
  onChange(next: TypeDef): void;
  typeNames: string[];
  /** depth > 0 means we're inside a nested field/array/union */
  depth?: number;
}

export function TypeBuilder({ value, onChange, typeNames, depth = 0 }: Props) {
  const { t } = useTranslation();
  const patch = (p: Partial<TypeDef>) => onChange({ ...(value as any), ...p });
  const hasConstraints = typeHasConstraints(value);
  const [showConstraints, setShowConstraints] = useState(hasConstraints);

  return (
    <div className={`text-sm ${depth > 0 ? '' : 'rounded-md border border-slate-200 bg-white p-2'}`}>
      {/* Kind + desc row */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">{t('kind')}</span>
          <select
            aria-label="Kind"
            value={value.kind}
            onChange={(e) => onChange(defaultFor(e.target.value as TypeDef['kind'], typeNames))}
            className="select text-xs"
          >
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="flex flex-1 min-w-0 items-center gap-1.5">
          <span className="text-[11px] text-slate-500">{t('desc')}</span>
          <input
            aria-label="description"
            className="input min-w-0 flex-1 text-xs"
            value={(value as any).description ?? ''}
            onChange={(e) => patch({ description: e.target.value || undefined } as any)}
          />
        </label>
      </div>

      {/* Constraint toggle for string / number / integer */}
      {(value.kind === 'string' || value.kind === 'number' || value.kind === 'integer') && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowConstraints((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition"
          >
            <Chevron open={showConstraints} />
            {t('constraints')}
            {hasConstraints && !showConstraints && (
              <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">has values</span>
            )}
          </button>
          {showConstraints && (
            <div className="mt-1.5 pl-3 border-l-2 border-slate-100">
              {value.kind === 'string' && (
                <StringConstraints value={value} onChange={patch as any} />
              )}
              {(value.kind === 'number' || value.kind === 'integer') && (
                <NumberConstraints value={value} onChange={patch as any} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Literal / ref / array / object / union controls */}
      {value.kind === 'array' && (
        <ArrayControls value={value} onChange={onChange} typeNames={typeNames} depth={depth} />
      )}
      {value.kind === 'object' && (
        <ObjectControls value={value} onChange={onChange} typeNames={typeNames} depth={depth} />
      )}
      {value.kind === 'union' && (
        <UnionControls value={value} onChange={onChange} typeNames={typeNames} depth={depth} />
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeHasConstraints(value: TypeDef): boolean {
  if (value.kind === 'string') {
    return !!(value.minLength != null || value.maxLength != null || value.pattern || value.enum?.length);
  }
  if (value.kind === 'number' || value.kind === 'integer') {
    return !!(value.min != null || value.max != null || value.enum?.length);
  }
  return false;
}

function numInput(label: string, v: number | undefined, set: (n?: number) => void) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="w-20 text-slate-500">{label}</span>
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      {numInput(t('minLength'), value.minLength, (n) => onChange({ minLength: n }))}
      {numInput(t('maxLength'), value.maxLength, (n) => onChange({ maxLength: n }))}
      <label className="flex items-center gap-1.5 text-xs">
        <span className="w-20 text-slate-500">{t('pattern')}</span>
        <input
          aria-label="pattern"
          className="input flex-1 font-mono text-xs"
          value={value.pattern ?? ''}
          onChange={(e) => onChange({ pattern: e.target.value || undefined })}
        />
      </label>
      <EnumField
        value={value.enum ?? []}
        onChange={(e) => onChange({ enum: e.length ? e : undefined })}
        parse={(s: string) => s}
      />
    </div>
  );
}

function NumberConstraints({ value, onChange }: any) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      {numInput(t('min'), value.min, (n) => onChange({ min: n }))}
      {numInput(t('max'), value.max, (n) => onChange({ max: n }))}
      <EnumField
        value={(value.enum ?? []).map(String)}
        onChange={(e) => onChange({ enum: e.length ? e.map(Number) : undefined })}
        parse={(s: string) => Number(s)}
      />
    </div>
  );
}

function EnumField({ value, onChange }: { value: string[]; onChange(v: string[]): void; parse: (s: string) => unknown }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="w-20 text-slate-500">enum</span>
      <input
        aria-label="enum"
        placeholder={t('enumValues')}
        className="input flex-1 font-mono text-xs"
        value={value.join(',')}
        onChange={(e) => onChange(e.target.value ? e.target.value.split(',').map((s) => s.trim()) : [])}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Object controls — collapsible fields
// ---------------------------------------------------------------------------

interface FieldRowProps {
  field: ObjectField;
  index: number;
  typeNames: string[];
  defaultOpen: boolean;
  onChange(patch: Partial<ObjectField>): void;
  onRemove(): void;
}

function FieldRow({ field, index, typeNames, defaultOpen, onChange, onRemove }: FieldRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      {/* Collapsed header — always visible */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-50 transition"
        onClick={() => setOpen((v) => !v)}
      >
        <Chevron open={open} />

        {/* Field name input — stop propagation so clicking it doesn't toggle */}
        <input
          aria-label={`field name ${index}`}
          placeholder="field name"
          className="input min-w-0 flex-1 font-mono text-xs h-6 px-1.5"
          value={field.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ name: e.target.value })}
        />

        {/* Type badge (collapsed view hint) */}
        {!open && <KindBadge kind={field.type.kind} />}

        {/* Required toggle */}
        <label
          className={`flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded border px-1.5 text-[10px] font-medium transition ${
            field.required
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'
          }`}
          title={t('required')}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          <span aria-hidden="true">{field.required ? '✓' : '○'}</span>
          {t('req')}
        </label>

        {/* Delete */}
        <button
          className="btn-icon shrink-0 text-red-400 hover:text-red-600 transition"
          aria-label={`remove field ${index}`}
          title="Remove field"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <IconTrash />
        </button>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-2">
          <TypeBuilder
            value={field.type}
            onChange={(tp) => onChange({ type: tp })}
            typeNames={typeNames}
            depth={1}
          />
        </div>
      )}
    </div>
  );
}

function ObjectControls({ value, onChange, typeNames }: any) {
  const { t } = useTranslation();
  // Track which fields were just added (should open automatically)
  const [newlyAdded, setNewlyAdded] = useState<Set<number>>(new Set());

  const setField = (i: number, patch: Partial<ObjectField>) => {
    const next = value.fields.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, fields: next });
  };

  const addField = () => {
    const idx = value.fields.length;
    onChange({ ...value, fields: [...value.fields, { name: '', required: true, type: { kind: 'string' } }] });
    setNewlyAdded((s) => new Set(s).add(idx));
  };

  return (
    <div className="mt-2 space-y-1.5">
      {/* Strict toggle */}
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={!!value.strict}
          onChange={(e) => onChange({ ...value, strict: e.target.checked || undefined })}
        />
        {t('strict')} <span className="text-slate-400">(fail on unknown fields)</span>
      </label>

      {/* Field count hint when no fields */}
      {value.fields.length === 0 && (
        <p className="text-[11px] text-slate-400 text-center py-1">{t('noFieldsYet')}</p>
      )}

      {/* Field rows */}
      {value.fields.map((f: ObjectField, i: number) => (
        <FieldRow
          key={i}
          field={f}
          index={i}
          typeNames={typeNames}
          defaultOpen={newlyAdded.has(i)}
          onChange={(patch) => setField(i, patch)}
          onRemove={() => {
            onChange({ ...value, fields: value.fields.filter((_: unknown, j: number) => j !== i) });
            setNewlyAdded((s) => { const next = new Set(s); next.delete(i); return next; });
          }}
        />
      ))}

      <button className="btn" onClick={addField}>
        <IconPlus /> {t('addField')}
      </button>

      <ExampleEditor value={value} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Array controls — collapsible element editor
// ---------------------------------------------------------------------------

function ArrayControls({ value, onChange, typeNames, depth }: any) {
  const { t } = useTranslation();
  const [showConstraints, setShowConstraints] = useState(false);
  const hasArrayConstraints = value.minItems != null || value.maxItems != null;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Array constraints toggle */}
      <button
        type="button"
        onClick={() => setShowConstraints((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition"
      >
        <Chevron open={showConstraints} />
        {t('constraints')}
        {hasArrayConstraints && !showConstraints && (
          <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">has values</span>
        )}
      </button>
      {showConstraints && (
        <div className="pl-3 border-l-2 border-slate-100 flex flex-col gap-1.5">
          {numInput(t('minItems'), value.minItems, (n) => onChange({ ...value, minItems: n }))}
          {numInput(t('maxItems'), value.maxItems, (n) => onChange({ ...value, maxItems: n }))}
        </div>
      )}

      {/* Element type — always visible */}
      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-50/70 border-b border-slate-100">
          <span className="text-[11px] text-slate-500 font-medium">{t('elementType')}</span>
          <KindBadge kind={value.element.kind} />
        </div>
        <div className="p-2">
          <TypeBuilder
            value={value.element}
            onChange={(el) => onChange({ ...value, element: el })}
            typeNames={typeNames}
            depth={(depth ?? 0) + 1}
          />
        </div>
      </div>

      <ExampleEditor value={value} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Union controls — collapsible variants
// ---------------------------------------------------------------------------

function UnionControls({ value, onChange, typeNames, depth }: any) {
  const { t } = useTranslation();
  const [openVariants, setOpenVariants] = useState<Set<number>>(new Set());

  const toggleVariant = (i: number) =>
    setOpenVariants((s) => {
      const next = new Set(s);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const addVariant = () => {
    const idx = value.variants.length;
    onChange({ ...value, variants: [...value.variants, { kind: 'string' }] });
    setOpenVariants((s) => new Set(s).add(idx));
  };

  return (
    <div className="mt-2 space-y-1.5">
      {value.variants.map((v: TypeDef, i: number) => {
        const isOpen = openVariants.has(i);
        return (
          <div key={i} className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <div
              className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-50 transition"
              onClick={() => toggleVariant(i)}
            >
              <Chevron open={isOpen} />
              <span className="text-[11px] text-slate-500">variant {i + 1}</span>
              {!isOpen && <KindBadge kind={v.kind} />}
              <div className="flex-1" />
              <button
                className="btn-icon text-red-400 hover:text-red-600 transition"
                aria-label={`remove variant ${i}`}
                title="Remove variant"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ ...value, variants: value.variants.filter((_: unknown, j: number) => j !== i) });
                }}
              >
                <IconTrash />
              </button>
            </div>
            {isOpen && (
              <div className="border-t border-slate-100 bg-slate-50/50 p-2">
                <TypeBuilder
                  value={v}
                  onChange={(next) => {
                    const variants = value.variants.slice();
                    variants[i] = next;
                    onChange({ ...value, variants });
                  }}
                  typeNames={typeNames}
                  depth={(depth ?? 0) + 1}
                />
              </div>
            )}
          </div>
        );
      })}
      <button className="btn" onClick={addVariant}>
        <IconPlus /> {t('addVariant')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Example JSON editor (object / array only)
// ---------------------------------------------------------------------------

function ExampleEditor({
  value,
  onChange,
}: {
  value: ObjectType | ArrayType;
  onChange: (next: TypeDef) => void;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState(
    value.example !== undefined ? JSON.stringify(value.example, null, 2) : ''
  );
  const [err, setErr] = useState<string | null>(null);

  function commit() {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setErr(null);
      const { example: _, ...rest } = value;
      onChange(rest as TypeDef);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      setErr(null);
      onChange({ ...value, example: parsed });
    } catch {
      setErr(t('invalidJson'));
    }
  }

  return (
    <label className="block">
      <span className="text-xs text-slate-500">{t('example')}</span>
      <textarea
        aria-label={t('example')}
        className="input mt-1 min-h-[80px] resize-y font-mono text-xs"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
      />
      {err && <div role="alert" className="mt-1 text-[11px] text-red-600">{err}</div>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Simple inline controls
// ---------------------------------------------------------------------------

function LiteralControls({ value, onChange }: any) {
  const { t } = useTranslation();
  return (
    <label className="mt-2 flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">{t('value')}</span>
      <input
        aria-label="literal value"
        placeholder={t('literalValue')}
        className="input font-mono text-xs"
        value={String(value.value)}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </label>
  );
}

function RefControls({ value, onChange, typeNames }: any) {
  const { t } = useTranslation();
  return (
    <label className="mt-2 flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">{t('ref')}</span>
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
