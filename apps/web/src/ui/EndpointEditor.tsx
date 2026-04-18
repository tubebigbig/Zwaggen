import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { HttpMethod, Assertions, Endpoint, Capture } from '../schema/types';
import { ParamTable } from './ParamTable';
import { TypeBuilder } from './TypeBuilder';
import { AuthEditor } from './AuthEditor';
import { RunPanel } from './RunPanel';
import { MethodBadge } from './MethodBadge';
import { IconFile, IconPlus, IconTrash } from './icons';

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

export function EndpointEditor() {
  const { t } = useTranslation();
  const { spec, setSpec, selectedEndpointId, deleteEndpoint } = useSpecStore();
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
          <button
            className="btn-icon ml-auto text-red-600 hover:text-red-700"
            aria-label="delete-endpoint"
            title={t('deleteEndpoint')}
            onClick={async () => {
              if (!confirm(t('deleteThisEndpoint'))) return;
              await deleteEndpoint(ep.id);
            }}
          >
            <IconTrash />
          </button>
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
        <ParamTable title={t('queryParams')} value={ep.queryParams} onChange={(v) => patch({ queryParams: v })} typeNames={Object.keys(spec.types)} />
        <ParamTable title={t('headers')} value={ep.headers} onChange={(v) => patch({ headers: v })} typeNames={Object.keys(spec.types)} />

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
          <div className="mb-2 flex items-center justify-between">
            <h3 className="panel-title">{t('requestBody')}</h3>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={!!ep.requestBody}
                onChange={(e) => patch({ requestBody: e.target.checked ? { kind: 'object', fields: [] } : null })}
              />
              {t('hasBody')}
            </label>
          </div>
          {ep.requestBody ? (
            <TypeBuilder value={ep.requestBody} onChange={(t2) => patch({ requestBody: t2 })} typeNames={Object.keys(spec.types)} />
          ) : (
            <p className="text-xs text-slate-400">{t('noBodyToggle')}</p>
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
