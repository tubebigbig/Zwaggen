import { useEffect } from 'react';
import { AppHeader } from './ui/AppHeader';
import { useSpecStore } from './state/store';

export function App() {
  const restoreDraft = useSpecStore((s) => s.restoreDraft);
  useEffect(() => {
    void restoreDraft();
  }, [restoreDraft]);
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="p-6 text-sm text-slate-700">Open or create a spec to get started.</main>
    </div>
  );
}
