import { useSpecStore } from '../state/store';

export function EnvEditor() {
  const { spec, setSpec } = useSpecStore();
  const activeName = spec.activeEnvironment;
  const env = spec.environments[activeName] ?? { variables: [] };

  const setEnvs = (envs: typeof spec.environments, active = activeName) =>
    void setSpec({ ...spec, environments: envs, activeEnvironment: active });

  const addEnv = () => {
    let i = 2;
    while (spec.environments[`env${i}`]) i++;
    setEnvs({ ...spec.environments, [`env${i}`]: { variables: [] } }, `env${i}`);
  };

  const setVar = (idx: number, patch: Partial<typeof env.variables[number]>) => {
    const next = env.variables.slice();
    next[idx] = { ...next[idx]!, ...patch };
    setEnvs({ ...spec.environments, [activeName]: { variables: next } });
  };

  return (
    <section className="border rounded p-2 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <label>Active env
          <select
            aria-label="Active environment"
            className="ml-1 border rounded px-1"
            value={activeName}
            onChange={(e) => void setSpec({ ...spec, activeEnvironment: e.target.value })}
          >
            {Object.keys(spec.environments).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="rounded border px-2 py-0.5" onClick={addEnv}>Add environment</button>
      </div>
      <div>
        <button
          className="rounded border px-2 py-0.5"
          onClick={() => setEnvs({
            ...spec.environments,
            [activeName]: { variables: [...env.variables, { name: '', value: '', secret: false }] },
          })}
        >Add variable</button>
      </div>
      <div className="space-y-1">
        {env.variables.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label="Variable name"
              className="border rounded px-1"
              value={v.name}
              onChange={(e) => setVar(i, { name: e.target.value })}
            />
            <input
              aria-label={`value-${v.name || i}`}
              className="border rounded px-1 flex-1"
              type={v.secret ? 'password' : 'text'}
              value={v.value}
              onChange={(e) => setVar(i, { value: e.target.value })}
            />
            <label className="flex items-center gap-1">
              <input
                aria-label="secret"
                type="checkbox"
                checked={v.secret}
                onChange={(e) => setVar(i, { secret: e.target.checked })}
              />
              secret
            </label>
            <button
              className="text-red-600"
              onClick={() => setEnvs({
                ...spec.environments,
                [activeName]: { variables: env.variables.filter((_, j) => j !== i) },
              })}
            >remove</button>
          </div>
        ))}
      </div>
    </section>
  );
}
