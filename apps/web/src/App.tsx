import { useEffect } from 'react';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { EndpointList } from './ui/EndpointList';
import { EndpointEditor } from './ui/EndpointEditor';
import { useSpecStore } from './state/store';

export function App() {
  const restoreDraft = useSpecStore((s) => s.restoreDraft);
  useEffect(() => { void restoreDraft(); }, [restoreDraft]);
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex flex-1">
        <TypePanel />
        <EndpointList />
        <EndpointEditor />
      </div>
    </div>
  );
}
