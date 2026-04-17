import { useSpecStore } from '../state/store';
import { HttpMethod } from '../schema/types';
import { ParamTable } from './ParamTable';
import { TypeBuilder } from './TypeBuilder';
import { AuthEditor } from './AuthEditor';
import { RunPanel } from './RunPanel';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function EndpointEditor() {
  const { spec, setSpec, selectedEndpointId } = useSpecStore();
  const endpoint = spec.endpoints.find((e) => e.id === selectedEndpointId);
  if (!endpoint) return <main className="flex-1 p-6 text-sm text-slate-500">Select or create an endpoint.</main>;

  const patch = (p: Partial<typeof endpoint>) => void setSpec({
    ...spec,
    endpoints: spec.endpoints.map((e) => e.id === endpoint.id ? { ...e, ...p } : e),
  });

  return (
    <main className="flex-1 p-6 space-y-4">
      <div className="flex gap-2">
        <label>Method
          <select
            aria-label="Method"
            className="border rounded px-1 ml-1"
            value={endpoint.method}
            onChange={(e) => patch({ method: e.target.value as HttpMethod })}
          >
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex-1">Path
          <input
            aria-label="Path"
            className="ml-1 border rounded px-1 w-full"
            value={endpoint.path}
            onChange={(e) => patch({ path: e.target.value })}
          />
        </label>
      </div>
      <label className="block">Description
        <textarea
          aria-label="Description"
          className="w-full border rounded px-1"
          value={endpoint.description ?? ''}
          onChange={(e) => patch({ description: e.target.value || undefined })}
        />
      </label>
      <ParamTable title="Path params" value={endpoint.pathParams} onChange={(v) => patch({ pathParams: v })} typeNames={Object.keys(spec.types)} />
      <ParamTable title="Query params" value={endpoint.queryParams} onChange={(v) => patch({ queryParams: v })} typeNames={Object.keys(spec.types)} />
      <ParamTable title="Headers" value={endpoint.headers} onChange={(v) => patch({ headers: v })} typeNames={Object.keys(spec.types)} />

      <section className="border rounded p-2">
        <h3 className="font-semibold text-sm mb-1">Auth</h3>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`auth-${endpoint.id}`}
            checked={endpoint.auth === 'inherit'}
            onChange={() => patch({ auth: 'inherit' })}
          /> inherit from spec default
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`auth-${endpoint.id}`}
            checked={endpoint.auth !== 'inherit'}
            onChange={() => patch({ auth: { type: 'none' } })}
          /> override
        </label>
        {endpoint.auth !== 'inherit' && (
          <AuthEditor value={endpoint.auth} onChange={(a) => patch({ auth: a })} />
        )}
      </section>

      <section className="border rounded p-2">
        <h3 className="font-semibold text-sm">Request body (application/json)</h3>
        <label className="mb-2 block">
          <input
            type="checkbox"
            checked={!!endpoint.requestBody}
            onChange={(e) => patch({ requestBody: e.target.checked ? { kind: 'object', fields: [] } : null })}
          /> has body
        </label>
        {endpoint.requestBody && (
          <TypeBuilder value={endpoint.requestBody} onChange={(t) => patch({ requestBody: t })} typeNames={Object.keys(spec.types)} />
        )}
      </section>

      <section className="border rounded p-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Responses</h3>
          <button
            className="rounded border px-2 py-0.5"
            onClick={() => patch({ responses: [...endpoint.responses, { status: 200, type: { kind: 'object', fields: [] } }] })}
          >Add response</button>
        </div>
        <div className="space-y-2">
          {endpoint.responses.map((r, i) => (
            <div key={i} className="border-l-2 border-slate-200 pl-2 space-y-1">
              <div className="flex gap-2">
                <label className="flex items-center gap-1">
                  <span>Status</span>
                  <input
                    aria-label="Status"
                    type="number"
                    className="border rounded px-1 w-20"
                    value={r.status}
                    onChange={(e) => {
                      const next = endpoint.responses.slice();
                      next[i] = { ...next[i]!, status: Number(e.target.value) };
                      patch({ responses: next });
                    }}
                  />
                </label>
                <button
                  className="text-red-600"
                  onClick={() => patch({ responses: endpoint.responses.filter((_, j) => j !== i) })}
                >remove</button>
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
      </section>

      <RunPanel />
    </main>
  );
}
