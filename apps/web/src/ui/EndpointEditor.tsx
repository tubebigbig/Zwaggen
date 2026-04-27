import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import {
  HttpMethod, Assertions, Endpoint, Capture, BodyContentType,
  type ObjectType, type RefType, type Spec,
} from '@zwaggen/core';
import { ParamTable } from './ParamTable';
import { TypeBuilder } from './TypeBuilder';
import { AuthEditor } from './AuthEditor';
import { RunPanel } from './RunPanel';
import { MethodBadge } from './MethodBadge';
import { OverflowMenu } from './OverflowMenu';
import { MenuItem } from './MenuItem';
import { IconFile, IconPlus, IconTrash } from './icons';

export type EndpointExportScope = { kind: 'endpoint'; endpointId: string };

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function TagInput({ value, onChange }: { value: string[]; onChange(next: string[] | undefined): void }) {
  const { t } = useTranslation();
  const [buffer, setBuffer] = useState('');

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) { setBuffer(''); return; }
    const next = [...value, tag];
    onChange(next);
    setBuffer('');
  }

  function remove(tag: string) {
    const next = value.filter((t) => t !== tag);
    onChange(next.length ? next : undefined);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
      {value.map((tag) => (
        <span key={tag} className="chip bg-slate-100 text-slate-700">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            className="ml-1 text-slate-400 hover:text-slate-700"
            onClick={() => remove(tag)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label={t('tags')}
        className="min-w-[80px] flex-1 border-0 bg-transparent text-xs focus:outline-none"
        placeholder={t('addTag')}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(buffer); }
          if (e.key === 'Backspace' && buffer === '' && value.length) remove(value[value.length - 1]!);
        }}
        onBlur={() => commit(buffer)}
      />
    </div>
  );
}

interface EndpointEditorProps {
  onExport?: (scope: EndpointExportScope) => void;
}

export function EndpointEditor({ onExport }: EndpointEditorProps = {}) {
  const { t } = useTranslation();
  const { spec, setSpec, selectedEndpointId, deleteEndpoint, duplicateEndpoint } = useSpecStore();
  const endpoint = spec.endpoints.find((e) => e.id === selectedEndpointId);

  if (!endpoint) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <IconFile width={22} height={22} />
          </div>
          <h3 className="text-base font-semibold text-slate-700">{t('noEndpointSelected')}</h3>
          <p className="text-sm text-slate-500">{t('selectOrCreateOne')}</p>
        </div>
      </main>
    );
  }

  // Hoist to const so narrowing carries into nested function declarations below.
  const ep = endpoint;

  const patch = (p: Partial<typeof ep>) => void setSpec({
    ...spec,
    endpoints: spec.endpoints.map((e) => e.id === ep.id ? { ...e, ...p } : e),
  });

  function patchAssertions(next: Partial<Assertions>) {
    const current = ep.assertions ?? {};
    const merged: Assertions = { ...current, ...next };
    const isEmpty =
      merged.expectedStatus === undefined &&
      merged.maxLatencyMs === undefined &&
      !merged.requiredHeaders?.length;

    const { assertions: _, ...rest } = ep;
    const nextEndpoint: Endpoint = isEmpty ? (rest as Endpoint) : { ...rest, assertions: merged };

    setSpec({
      ...spec,
      endpoints: spec.endpoints.map((e) => e.id === ep.id ? nextEndpoint : e),
    });
  }

  function addHeaderRow() {
    const cur = ep.assertions?.requiredHeaders ?? [];
    patchAssertions({ requiredHeaders: [...cur, { name: '', value: '' }] });
  }

  function updateHeaderRow(i: number, field: 'name' | 'value', value: string) {
    const cur = ep.assertions?.requiredHeaders ?? [];
    const next = cur.map((h, idx) => idx === i ? { ...h, [field]: value } : h);
    patchAssertions({ requiredHeaders: next });
  }

  function removeHeaderRow(i: number) {
    const cur = ep.assertions?.requiredHeaders ?? [];
    const next = cur.filter((_, idx) => idx !== i);
    patchAssertions({ requiredHeaders: next.length > 0 ? next : undefined });
  }

  function patchCaptures(next: Capture[] | undefined) {
    const { captures: _, ...rest } = ep;
    setSpec({
      ...spec,
      endpoints: spec.endpoints.map((e) =>
        e.id === ep.id
          ? (next && next.length > 0 ? { ...rest, captures: next } : (rest as Endpoint))
          : e
      ),
    });
  }

  function addCapture() {
    patchCaptures([...(ep.captures ?? []), { path: '', setVar: '' }]);
  }

  function updateCapture(i: number, field: 'path' | 'setVar' | 'envName', value: string) {
    const cur = ep.captures ?? [];
    const next = cur.map((c, idx) =>
      idx === i
        ? field === 'envName'
          ? { ...c, envName: value || undefined }
          : { ...c, [field]: value }
        : c
    );
    patchCaptures(next);
  }

  function removeCapture(i: number) {
    const next = (ep.captures ?? []).filter((_, idx) => idx !== i);
    patchCaptures(next.length > 0 ? next : undefined);
  }

  const updateTags = (next: string[] | undefined) => {
    setSpec({
      ...spec,
      endpoints: spec.endpoints.map((e) => {
        if (e.id !== ep.id) return e;
        const { tags: _, ...rest } = e;
        return next ? { ...rest, tags: next } : rest;
      }),
    });
  };

  return (
    <main className="thin-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-5">
        <div className="flex items-center gap-3">
          <MethodBadge method={ep.method} size="md" />
          <span className="truncate font-mono text-sm text-slate-500">{ep.path}</span>
          <div className="ml-auto">
            <OverflowMenu>
              <MenuItem
                onClick={() => onExport?.({ kind: 'endpoint', endpointId: ep.id })}
              >
                {t('export')}
              </MenuItem>
              <MenuItem onClick={async () => { await duplicateEndpoint(ep.id); }}>
                {t('duplicate')}
              </MenuItem>
              <MenuItem
                danger
                onClick={async () => {
                  if (!confirm(t('deleteThisEndpoint'))) return;
                  await deleteEndpoint(ep.id);
                }}
              >
                {t('delete')}
              </MenuItem>
            </OverflowMenu>
          </div>
        </div>

        <div className="card p-3">
          <div className="flex gap-2">
            <label className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{t('method')}</span>
              <select
                aria-label={t('method')}
                className="select"
                value={ep.method}
                onChange={(e) => patch({ method: e.target.value as HttpMethod })}
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="flex items-center flex-1 gap-1">
              <input
                aria-label={t('path')}
                className="input font-mono"
                value={ep.path}
                onChange={(e) => patch({ path: e.target.value })}
              />
            </label>
          </div>
          <label className="mt-2 block">
            <span className="text-xs text-slate-500">{t('description')}</span>
            <textarea
              aria-label={t('description')}
              className="input mt-1 min-h-[44px] resize-y"
              value={ep.description ?? ''}
              onChange={(e) => patch({ description: e.target.value || undefined })}
            />
          </label>
          <label className="mt-2 block">
            <span className="text-xs text-slate-500">{t('tags')}</span>
            <div className="mt-1">
              <TagInput
                value={ep.tags ?? []}
                onChange={updateTags}
              />
            </div>
          </label>
        </div>

        <ParamTable title={t('pathParams')} value={ep.pathParams} onChange={(v) => patch({ pathParams: v })} typeNames={Object.keys(spec.types)} />
        <QueryHeaderSection
          label={t('queryParams')}
          value={ep.queryParams}
          onChange={(v) => patch(v === undefined ? ({ queryParams: undefined } as Partial<Endpoint>) : { queryParams: v })}
          spec={spec}
          onPromoteToSharedType={(typeName, fields) => {
            setSpec({
              ...spec,
              types: { ...spec.types, [typeName]: { kind: 'object', fields } },
              endpoints: spec.endpoints.map((e) => e.id === ep.id ? { ...e, queryParams: { kind: 'ref', ref: typeName } } : e),
            });
          }}
        />
        <QueryHeaderSection
          label={t('headers')}
          value={ep.headers}
          onChange={(v) => patch(v === undefined ? ({ headers: undefined } as Partial<Endpoint>) : { headers: v })}
          spec={spec}
          onPromoteToSharedType={(typeName, fields) => {
            setSpec({
              ...spec,
              types: { ...spec.types, [typeName]: { kind: 'object', fields } },
              endpoints: spec.endpoints.map((e) => e.id === ep.id ? { ...e, headers: { kind: 'ref', ref: typeName } } : e),
            });
          }}
        />

        <section className="card p-3">
          <h3 className="panel-title mb-2">{t('auth')}</h3>
          <div className="mb-2 flex gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`auth-${ep.id}`}
                checked={ep.auth === 'inherit'}
                onChange={() => patch({ auth: 'inherit' })}
              />
              {t('inherit')}
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`auth-${ep.id}`}
                checked={ep.auth !== 'inherit'}
                onChange={() => patch({ auth: { type: 'none' } })}
              />
              {t('override')}
            </label>
          </div>
          {ep.auth !== 'inherit' && (
            <AuthEditor value={ep.auth} onChange={(a) => patch({ auth: a })} />
          )}
        </section>

        <section className="card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="panel-title">{t('requestBody')}</h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <span>{t('bodyType')}</span>
                <select
                  aria-label={t('bodyType')}
                  className="select text-xs"
                  value={ep.bodyContentType ?? 'json'}
                  onChange={(e) => {
                    const next = e.target.value as BodyContentType;
                    if (next === 'json') {
                      // Switching back to JSON: clear bodyForm + bodyContentType.
                      const { bodyContentType: _bct, bodyForm: _bf, ...rest } = ep;
                      setSpec({
                        ...spec,
                        endpoints: spec.endpoints.map((e2) => e2.id === ep.id ? (rest as Endpoint) : e2),
                      });
                    } else {
                      // Switching to non-JSON: clear requestBody, seed bodyForm if missing.
                      patch({
                        bodyContentType: next,
                        requestBody: null,
                        bodyForm: ep.bodyForm ?? [],
                      });
                    }
                  }}
                >
                  <option value="json">{t('bodyTypeJson')}</option>
                  <option value="urlencoded">{t('bodyTypeUrlencoded')}</option>
                  <option value="multipart">{t('bodyTypeMultipart')}</option>
                </select>
              </label>
              {(ep.bodyContentType ?? 'json') === 'json' && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!ep.requestBody}
                    onChange={(e) => patch({ requestBody: e.target.checked ? { kind: 'object', fields: [] } : null })}
                  />
                  {t('hasBody')}
                </label>
              )}
            </div>
          </div>
          {(ep.bodyContentType ?? 'json') === 'json' ? (
            ep.requestBody ? (
              <TypeBuilder value={ep.requestBody} onChange={(t2) => patch({ requestBody: t2 })} typeNames={Object.keys(spec.types)} />
            ) : (
              <p className="text-xs text-slate-400">{t('noBodyToggle')}</p>
            )
          ) : (
            <ParamTable
              title={t('formFields')}
              value={ep.bodyForm ?? []}
              onChange={(v) => patch({ bodyForm: v })}
              typeNames={Object.keys(spec.types)}
              allowFileType={ep.bodyContentType === 'multipart'}
            />
          )}
        </section>

        <section className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="panel-title">{t('responses')}</h3>
            <button
              className="btn"
              onClick={() => patch({ responses: [...ep.responses, { status: 200, type: { kind: 'object', fields: [] } }] })}
            >
              <IconPlus /> {t('addResponse')}
            </button>
          </div>
          {ep.responses.length === 0 ? (
            <p className="text-xs text-slate-400">{t('noResponsesDefined')}</p>
          ) : (
            <div className="space-y-3">
              {ep.responses.map((r, i) => (
                <div key={i} className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span>{t('status')}</span>
                      <input
                        aria-label={t('status')}
                        type="number"
                        className="input w-20 font-mono text-xs"
                        value={r.status}
                        onChange={(e) => {
                          const next = ep.responses.slice();
                          next[i] = { ...next[i]!, status: Number(e.target.value) };
                          patch({ responses: next });
                        }}
                      />
                    </label>
                    <button
                      className="btn-icon ml-auto text-red-600 hover:text-red-700"
                      aria-label={`remove-response-${i}`}
                      title={t('removeResponse')}
                      onClick={() => patch({ responses: ep.responses.filter((_, j) => j !== i) })}
                    >
                      <IconTrash />
                    </button>
                  </div>
                  <TypeBuilder
                    value={r.type}
                    onChange={(t2) => {
                      const next = ep.responses.slice();
                      next[i] = { ...next[i]!, type: t2 };
                      patch({ responses: next });
                    }}
                    typeNames={Object.keys(spec.types)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-3">
          <h3 className="panel-title mb-2">{t('assertions')}</h3>
          <label className="block">
            <span className="text-xs text-slate-500">{t('expectedStatus')}</span>
            <input
              type="number"
              aria-label={t('expectedStatus')}
              className="input mt-1 font-mono text-xs"
              value={ep.assertions?.expectedStatus ?? ''}
              onChange={(e) => patchAssertions({ expectedStatus: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </label>
          <label className="mt-2 block">
            <span className="text-xs text-slate-500">{t('maxLatencyMs')}</span>
            <input
              type="number"
              aria-label={t('maxLatencyMs')}
              className="input mt-1 font-mono text-xs"
              value={ep.assertions?.maxLatencyMs ?? ''}
              onChange={(e) => patchAssertions({ maxLatencyMs: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </label>
          <div className="mt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{t('requiredHeaders')}</span>
              <button className="btn" onClick={addHeaderRow}>
                <IconPlus /> {t('addHeader')}
              </button>
            </div>
            {(ep.assertions?.requiredHeaders ?? []).map((h, i) => (
              <div key={i} className="mt-1 flex gap-1">
                <input
                  aria-label={`header-name-${i}`}
                  className="input flex-1 font-mono text-xs"
                  value={h.name}
                  onChange={(e) => updateHeaderRow(i, 'name', e.target.value)}
                />
                <input
                  aria-label={`header-value-${i}`}
                  className="input flex-1 font-mono text-xs"
                  value={h.value}
                  onChange={(e) => updateHeaderRow(i, 'value', e.target.value)}
                />
                <button
                  className="btn-icon text-red-600 hover:text-red-700"
                  aria-label={`remove-header-${i}`}
                  onClick={() => removeHeaderRow(i)}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-3">
          <div className="mb-2">
            <h3 className="panel-title">{t('captures')}</h3>
            <p className="mt-1 text-[11px] text-slate-500">{t('capturesHint')}</p>
          </div>
          {(ep.captures ?? []).map((c, i) => (
            <div key={i} className="mt-1 flex items-center gap-1">
              <input
                aria-label={`capture-path-${i}`}
                className="input flex-1 font-mono text-xs"
                placeholder="data.token"
                value={c.path}
                onChange={(e) => updateCapture(i, 'path', e.target.value)}
              />
              <span className="text-slate-400">→</span>
              <input
                aria-label={`capture-var-${i}`}
                className="input w-32 font-mono text-xs"
                placeholder="authToken"
                value={c.setVar}
                onChange={(e) => updateCapture(i, 'setVar', e.target.value)}
              />
              <select
                aria-label={`capture-env-${i}`}
                className="input w-32 text-xs"
                value={c.envName ?? ''}
                onChange={(e) => updateCapture(i, 'envName', e.target.value)}
              >
                <option value="">{t('activeEnv')}</option>
                {Object.keys(spec.environments).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn-icon"
                aria-label={`remove-capture-${i}`}
                onClick={() => removeCapture(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn mt-2 text-xs" onClick={addCapture}>
            {t('addCapture')}
          </button>
        </section>

        <RunPanel />
      </div>
    </main>
  );
}

/**
 * Query/header param section editor — toggles between None, Inline (field
 * editor on an inline ObjectType), and Use shared type (pick a named object
 * type from spec.types). Mirrors v7's `endpoint.queryParams: ObjectType |
 * RefType | undefined` shape.
 *
 * Mode-switch behaviors:
 * - inline → ref: pick the first available named object type. No copy of
 *   inline fields onto the named type — the inline fields are dropped.
 * - ref → inline: COPY the ref'd type's fields into the new inline object so
 *   the user keeps their starting point (non-destructive).
 * - any → none: drop the slot (field omitted from the endpoint).
 */
function QueryHeaderSection({ label, value, onChange, spec, onPromoteToSharedType }: {
  label: string;
  value: ObjectType | RefType | undefined;
  onChange: (next: ObjectType | RefType | undefined) => void;
  spec: Spec;
  onPromoteToSharedType: (typeName: string, fields: ObjectType['fields']) => void;
}) {
  const { t } = useTranslation();
  const namedObjectTypes = Object.entries(spec.types)
    .filter(([, ty]) => ty.kind === 'object')
    .map(([name]) => name);
  // Defensive normalization for legacy data: a draft saved during v7
  // PR development may carry queryParams/headers as a stray ParamDef[]
  // (e.g. an empty array from before the migration was applied to that
  // particular endpoint). Treat empty arrays as 'none' and non-empty
  // arrays as inline objects so the editor doesn't render an
  // un-editable mode='inline'-with-no-data ghost.
  const normalized: ObjectType | RefType | undefined =
    Array.isArray(value)
      ? (value.length === 0 ? undefined : { kind: 'object', fields: value as ObjectType['fields'] })
      : value;
  // Mode mirrors the (normalized) underlying value: undefined → 'none'
  // (section hides its editor), object → 'inline', ref → 'ref'. The
  // dropdown is the single source of truth for switching shapes. None
  // mode renders nothing so the editor stays uncluttered for endpoints
  // without query/headers.
  const mode: 'none' | 'inline' | 'ref' =
    !normalized ? 'none' : normalized.kind === 'ref' ? 'ref' : 'inline';
  const inlineFields: ObjectType['fields'] =
    normalized && normalized.kind === 'object' ? normalized.fields : [];

  function handlePromote() {
    const fields = inlineFields;
    if (fields.length === 0) return;
    const name = (window.prompt(t('promoteSharedTypePrompt'), '') ?? '').trim();
    if (!name) return;
    if (spec.types[name]) {
      window.alert(t('promoteSharedTypeCollision', { name }));
      return;
    }
    onPromoteToSharedType(name, fields);
  }

  return (
    <section className="card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="panel-title">{label}</h3>
        <select
          aria-label={`${label} mode`}
          className="select text-xs"
          value={mode}
          onChange={(e) => {
            const next = e.target.value as 'none' | 'inline' | 'ref';
            if (next === 'none') {
              onChange(undefined);
              return;
            }
            if (next === 'inline') {
              // Always start inline empty. Copying from a ref'd type was
              // surprising — switching to "Use shared type" auto-picks the
              // first available named type, and switching back to Inline
              // would silently inherit those fields (often from a totally
              // different endpoint that promoted them earlier).
              onChange({ kind: 'object', fields: [] });
              return;
            }
            // next === 'ref'
            const first = namedObjectTypes[0];
            if (first) onChange({ kind: 'ref', ref: first });
          }}
        >
          <option value="none">{t('none')}</option>
          <option value="inline">{t('inlineFields')}</option>
          <option
            value="ref"
            disabled={namedObjectTypes.length === 0}
            title={namedObjectTypes.length === 0 ? t('defineObjectTypeFirst') : undefined}
          >
            {t('useSharedType')}
          </option>
        </select>
      </div>
      {mode === 'inline' && normalized && normalized.kind === 'object' && (
        <InlineFieldsEditor
          fields={normalized.fields}
          onChange={(fields) => onChange({ kind: 'object', fields })}
          typeNames={Object.keys(spec.types)}
          onPromote={normalized.fields.length > 0 ? handlePromote : undefined}
        />
      )}
      {mode === 'ref' && normalized && normalized.kind === 'ref' && (
        <select
          aria-label={`${label} ref`}
          className="select w-full text-xs"
          value={normalized.ref}
          onChange={(e) => onChange({ kind: 'ref', ref: e.target.value })}
        >
          {namedObjectTypes.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      )}
    </section>
  );
}

/**
 * Field editor for an inline ObjectType, sharing the look/feel of
 * `ParamTable` but rendering a list of `ObjectField` (no double-card wrap).
 * Mirrors the row layout: name input, required toggle, type-builder, remove.
 */
function InlineFieldsEditor({ fields, onChange, typeNames, onPromote }: {
  fields: ObjectType['fields'];
  onChange(next: ObjectType['fields']): void;
  typeNames: string[];
  onPromote?: () => void;
}) {
  const { t } = useTranslation();
  const patch = (i: number, p: Partial<ObjectType['fields'][number]>) => {
    const next = fields.slice();
    const current = next[i];
    if (!current) return;
    next[i] = { ...current, ...p };
    onChange(next);
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
        {onPromote && (
          <button
            type="button"
            className="btn text-xs"
            onClick={onPromote}
            title={t('promoteSharedTypeTitle')}
          >
            {t('promoteSharedType')}
          </button>
        )}
        <button
          className="btn"
          onClick={() => onChange([...fields, { name: '', required: true, type: { kind: 'string' } }])}
        >
          <IconPlus /> {t('addParam')}
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-slate-400">None.</p>
      ) : (
        <div className="space-y-3">
          {fields.map((p, i) => (
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
                  onClick={() => onChange(fields.filter((_, j) => j !== i))}
                >
                  <IconTrash />
                </button>
              </div>
              <TypeBuilder value={p.type} onChange={(t) => patch(i, { type: t })} typeNames={typeNames} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
