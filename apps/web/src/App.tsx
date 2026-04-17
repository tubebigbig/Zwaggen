import { useEffect } from 'react';
import { AppHeader } from './ui/AppHeader';
import { TypePanel } from './ui/TypePanel';
import { useSpecStore } from './state/store';

export function App() {
  const restoreDraft = useSpecStore((s) => s.restoreDraft);
  useEffect(() => { void restoreDraft(); }, [restoreDraft]);
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex flex-1">
        <TypePanel />
        <main className="flex-1 p-6 text-sm text-slate-700">Select or create an endpoint.</main>
      </div>
    </div>
  );
}
