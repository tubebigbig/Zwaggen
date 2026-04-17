import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { IconAlert, IconPlus, IconTrash } from './icons';

export function EnvEditor() {
  const { t } = useTranslation();
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
    <section className="space-y-2 text-sm">
      <div className="space-y-1.5">
        <label className="flex items-center gap-2">
          <span className="w-12 text-xs text-slate-500">{t('active')}</span>
          <select
            aria-label="Active environment"
            className="select flex-1"
            value={activeName}
            onChange={(e) => void setSpec({ ...spec, activeEnvironment: e.target.value })}
          >
            {Object.keys(spec.environments).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="btn w-full" onClick={addEnv}>
          <IconPlus />
          {t('addEnvironment')}
        </button>
      </div>

      <div className="space-y-1.5">
        {env.variables.length === 0 && (
          <p className="text-[11px] text-slate-400">No variables yet. Add one to reference as <code className="font-mono">{'{{name}}'}</code>.</p>
        )}
        {env.variables.map((v, i) => (
          <div key={i} className="space-y-1 rounded-md border border-slate-200 bg-slate-50/60 p-2">
            <div className="flex items-center gap-2">
              <input
                aria-label="Variable name"
                placeholder="name"
                className="input flex-1 font-mono text-xs"
                value={v.name}
                onChange={(e) => setVar(i, { name: e.target.value })}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  aria-label="secret"
                  type="checkbox"
                  checked={v.secret}
                  onChange={(e) => setVar(i, { secret: e.target.checked })}
                />
                {t('secret')}
              </label>
              <button
                className="btn-icon text-red-600 hover:text-red-700"
                aria-label={`remove-${v.name || i}`}
                title={t('removeVariable')}
                onClick={() => setEnvs({
                  ...spec.environments,
                  [activeName]: { variables: env.variables.filter((_, j) => j !== i) },
                })}
              >
                <IconTrash />
              </button>
            </div>
            <input
              aria-label={`value-${v.name || i}`}
              placeholder="value"
              className="input font-mono text-xs"
              type={v.secret ? 'password' : 'text'}
              value={v.value}
              onChange={(e) => setVar(i, { value: e.target.value })}
            />
            {v.secret && !v.value && (
              <div role="alert" className="flex items-center gap-1 text-[11px] text-red-600">
                <IconAlert width={12} height={12} />
                {t('missingSecret')}
              </div>
            )}
          </div>
        ))}
        <button
          className="btn w-full"
          onClick={() => setEnvs({
            ...spec.environments,
            [activeName]: { variables: [...env.variables, { name: '', value: '', secret: false }] },
          })}
        >
          <IconPlus />
          {t('addVariable')}
        </button>
      </div>
    </section>
  );
}
