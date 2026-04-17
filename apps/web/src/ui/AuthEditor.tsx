import type { AuthPreset } from '../schema/types';

export function AuthEditor({ value, onChange }: { value: AuthPreset; onChange(next: AuthPreset): void }) {
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Type</span>
        <select
          aria-label="Auth type"
          className="select flex-1"
          value={value.type}
          onChange={(e) => {
            const t = e.target.value as AuthPreset['type'];
            if (t === 'none') onChange({ type: 'none' });
            if (t === 'bearer') onChange({ type: 'bearer', token: '' });
            if (t === 'basic') onChange({ type: 'basic', username: '', password: '' });
            if (t === 'apiKey') onChange({ type: 'apiKey', in: 'header', name: '', value: '' });
          }}
        >
          <option value="none">None</option>
          <option value="bearer">Bearer</option>
          <option value="basic">Basic</option>
          <option value="apiKey">API Key</option>
        </select>
      </label>

      {value.type === 'bearer' && (
        <label className="block">
          <span className="text-xs text-slate-500">Token</span>
          <input
            aria-label="Token"
            className="input mt-1 font-mono text-xs"
            value={value.token}
            onChange={(e) => onChange({ ...value, token: e.target.value })}
          />
        </label>
      )}

      {value.type === 'basic' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">Username</span>
            <input
              aria-label="Username"
              className="input mt-1 font-mono text-xs"
              value={value.username}
              onChange={(e) => onChange({ ...value, username: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Password</span>
            <input
              aria-label="Password"
              type="password"
              className="input mt-1 font-mono text-xs"
              value={value.password}
              onChange={(e) => onChange({ ...value, password: e.target.value })}
            />
          </label>
        </div>
      )}

      {value.type === 'apiKey' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <span className="text-xs text-slate-500">In</span>
            <select
              aria-label="API key location"
              className="select flex-1"
              value={value.in}
              onChange={(e) => onChange({ ...value, in: e.target.value as 'header' | 'query' })}
            >
              <option value="header">header</option>
              <option value="query">query</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-500">Name</span>
              <input
                aria-label="API key name"
                className="input mt-1 font-mono text-xs"
                value={value.name}
                onChange={(e) => onChange({ ...value, name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Value</span>
              <input
                aria-label="API key value"
                className="input mt-1 font-mono text-xs"
                value={value.value}
                onChange={(e) => onChange({ ...value, value: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
