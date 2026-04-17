import { useEffect } from 'react';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { EndpointList } from './ui/EndpointList';
import { EndpointEditor } from './ui/EndpointEditor';
import { EnvEditor } from './ui/EnvEditor';
import { AuthEditor } from './ui/AuthEditor';
import { useSpecStore } from './state/store';

export function App() {
  const { spec, setSpec, restoreDraft } = useSpecStore();
  useEffect(() => { void restoreDraft(); }, [restoreDraft]);
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex flex-1">
        <TypePanel />
        <EndpointList />
        <EndpointEditor />
        <aside className="w-80 border-l p-3 space-y-3">
          <h2 className="font-semibold text-sm">Environment</h2>
          <EnvEditor />
          <h2 className="font-semibold text-sm">Default auth</h2>
          <AuthEditor
            value={spec.auth}
            onChange={(auth) => void setSpec({ ...spec, auth })}
          />
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={spec.useProxyDefault}
              onChange={(e) => void setSpec({ ...spec, useProxyDefault: e.target.checked })}
            />
            use proxy by default
          </label>
        </aside>
      </div>
    </div>
  );
}
