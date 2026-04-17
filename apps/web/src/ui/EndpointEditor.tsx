import { useSpecStore } from '../state/store';
import { HttpMethod } from '../schema/types';
import { ParamTable } from './ParamTable';
import { TypeBuilder } from './TypeBuilder';
import { AuthEditor } from './AuthEditor';
import { RunPanel } from './RunPanel';
import { MethodBadge } from './MethodBadge';
import { IconFile, IconPlus, IconTrash } from './icons';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function EndpointEditor() {
  const { spec, setSpec, selectedEndpointId } = useSpecStore();
  const endpoint = spec.endpoints.find((e) => e.id === selectedEndpointId);

  if (!endpoint) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <IconFile width={22} height={22} />
          </div>
          <h3 className="text-base font-semibold text-slate-700">No endpoint selected</h3>
          <p className="text-sm text-slate-500">
            Pick one from the list on the left, or create a new endpoint to start defining a route and its types.
          </p>
        </div>
      </main>
    );
  }

  const patch = (p: Partial<typeof endpoint>) => void setSpec({
    ...spec,
    endpoints: spec.endpoints.map((e) => e.id === endpoint.id ? { ...e, ...p } : e),
  });

  return (
    <main className="thin-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-5">
        <div className="flex items-center gap-3">
          <MethodBadge method={endpoint.method} size="md" />
          <span className="truncate font-mono text-sm text-slate-500">{endpoint.path}</span>
          <button
            className="btn-icon ml-auto text-red-600 hover:text-red-700"
            aria-label="delete-endpoint"
            title="Delete endpoint"
            onClick={() => {
              if (!confirm('Delete this endpoint?')) return;
              setSpec({ ...spec, endpoints: spec.endpoints.filter((e) => e.id !== endpoint.id) });
            }}
          >
            <IconTrash />
          </button>
        </div>

        <div className="card p-3">
          <div className="flex gap-2">
            <label className="flex items-center gap-1">
              <span className="text-xs text-slate-500">Method</span>
              <select
                aria-label="Method"
                className="select"
                value={endpoint.method}
                onChange={(e) => patch({ method: e.target.value as HttpMethod })}
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="flex items-center flex-1 gap-1">
              <input
                aria-label="Path"
                className="input font-mono"
                value={endpoint.path}
                onChange={(e) => patch({ path: e.target.value })}
              />
            </label>
          </div>
          <label className="mt-2 block">
            <span className="text-xs text-slate-500">Description</span>
            <textarea
              aria-label="Description"
              className="input mt-1 min-h-[44px] resize-y"
              value={endpoint.description ?? ''}
              onChange={(e) => patch({ description: e.target.value || undefined })}
            />
          </label>
        </div>

        <ParamTable title="Path params" value={endpoint.pathParams} onChange={(v) => patch({ pathParams: v })} typeNames={Object.keys(spec.types)} />
        <ParamTable title="Query params" value={endpoint.queryParams} onChange={(v) => patch({ queryParams: v })} typeNames={Object.keys(spec.types)} />
        <ParamTable title="Headers" value={endpoint.headers} onChange={(v) => patch({ headers: v })} typeNames={Object.keys(spec.types)} />

        <section className="card p-3">
          <h3 className="panel-title mb-2">Auth</h3>
          <div className="mb-2 flex gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`auth-${endpoint.id}`}
                checked={endpoint.auth === 'inherit'}
                onChange={() => patch({ auth: 'inherit' })}
              />
              inherit from spec default
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`auth-${endpoint.id}`}
                checked={endpoint.auth !== 'inherit'}
                onChange={() => patch({ auth: { type: 'none' } })}
              />
              override
            </label>
          </div>
          {endpoint.auth !== 'inherit' && (
            <AuthEditor value={endpoint.auth} onChange={(a) => patch({ auth: a })} />
          )}
        </section>

        <section className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="panel-title">Request body (application/json)</h3>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={!!endpoint.requestBody}
                onChange={(e) => patch({ requestBody: e.target.checked ? { kind: 'object', fields: [] } : null })}
              />
              has body
            </label>
          </div>
          {endpoint.requestBody ? (
            <TypeBuilder value={endpoint.requestBody} onChange={(t) => patch({ requestBody: t })} typeNames={Object.keys(spec.types)} />
          ) : (
            <p className="text-xs text-slate-400">Toggle "has body" to declare the request payload shape.</p>
          )}
        </section>

        <section className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="panel-title">Responses</h3>
            <button
              className="btn"
              onClick={() => patch({ responses: [...endpoint.responses, { status: 200, type: { kind: 'object', fields: [] } }] })}
            >
              <IconPlus /> Add response
            </button>
          </div>
          {endpoint.responses.length === 0 ? (
            <p className="text-xs text-slate-400">No responses defined. Add one to enable validation after sending.</p>
          ) : (
            <div className="space-y-3">
              {endpoint.responses.map((r, i) => (
                <div key={i} className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span>Status</span>
                      <input
                        aria-label="Status"
                        type="number"
                        className="input w-20 font-mono text-xs"
                        value={r.status}
                        onChange={(e) => {
                          const next = endpoint.responses.slice();
                          next[i] = { ...next[i]!, status: Number(e.target.value) };
                          patch({ responses: next });
                        }}
                      />
                    </label>
                    <button
                      className="btn-icon ml-auto text-red-600 hover:text-red-700"
                      aria-label={`remove-response-${i}`}
                      title="Remove response"
                      onClick={() => patch({ responses: endpoint.responses.filter((_, j) => j !== i) })}
                    >
                      <IconTrash />
                    </button>
                  </div>
                  <TypeBuilder
                    value={r.type}
                    onChange={(t) => {
                      const next = endpoint.responses.slice();
                      next[i] = { ...next[i]!, type: t };
                      patch({ responses: next });
                    }}
                    typeNames={Object.keys(spec.types)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <RunPanel />
      </div>
    </main>
  );
}
