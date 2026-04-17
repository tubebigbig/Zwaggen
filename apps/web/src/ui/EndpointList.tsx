import { useSpecStore } from '../state/store';

export function EndpointList() {
  const { spec, setSpec } = useSpecStore();
  const selected = useSpecStore((s) => s.selectedEndpointId);
  const select = useSpecStore((s) => s.selectEndpoint);

  async function add() {
    const id = crypto.randomUUID();
    await setSpec({
      ...spec,
      endpoints: [...spec.endpoints, {
        id, method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      }],
    });
    select(id);
  }

  return (
    <aside className="w-64 border-r p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Endpoints</h2>
        <button className="rounded border px-2 py-0.5" onClick={() => void add()}>New endpoint</button>
      </div>
      <ul className="space-y-1 text-sm">
        {spec.endpoints.map((e) => (
          <li key={e.id}>
            <button
              className={`text-left ${e.id === selected ? 'font-semibold' : ''}`}
              onClick={() => select(e.id)}
            >
              <span className="mr-2 font-mono text-xs">{e.method}</span>{e.path}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
