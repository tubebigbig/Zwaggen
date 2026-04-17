import { useSpecStore } from '../state/store';
import { HttpMethod } from '../schema/types';

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
      {/* Further sections added in later tasks */}
    </main>
  );
}
