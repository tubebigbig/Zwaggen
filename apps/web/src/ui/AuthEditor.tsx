import type { AuthPreset } from '../schema/types';

export function AuthEditor({ value, onChange }: { value: AuthPreset; onChange(next: AuthPreset): void }) {
  return (
    <div className="border rounded p-2 text-sm space-y-2">
      <label>Auth
        <select
          aria-label="Auth type"
          className="ml-1 border rounded px-1"
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
        <label>Token <input aria-label="Token" className="border rounded px-1 ml-1" value={value.token} onChange={(e) => onChange({ ...value, token: e.target.value })} /></label>
      )}
      {value.type === 'basic' && (
        <div className="flex gap-2">
          <label>User <input aria-label="Username" className="border rounded px-1 ml-1" value={value.username} onChange={(e) => onChange({ ...value, username: e.target.value })} /></label>
          <label>Pass <input aria-label="Password" type="password" className="border rounded px-1 ml-1" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} /></label>
        </div>
      )}
      {value.type === 'apiKey' && (
        <div className="flex gap-2">
          <label>In
            <select aria-label="API key location" className="ml-1 border rounded px-1" value={value.in} onChange={(e) => onChange({ ...value, in: e.target.value as 'header' | 'query' })}>
              <option value="header">header</option>
              <option value="query">query</option>
            </select>
          </label>
          <label>Name <input aria-label="API key name" className="border rounded px-1 ml-1" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></label>
          <label>Value <input aria-label="API key value" className="border rounded px-1 ml-1" value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}
