import { useEffect, useMemo, useState } from 'react';

export function useBreakpoint(query: string): boolean {
  const mql = useMemo(
    () => (typeof window === 'undefined' ? null : window.matchMedia(query)),
    [query],
  );
  const [matches, setMatches] = useState(mql?.matches ?? false);

  useEffect(() => {
    if (!mql) return;
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mql]);

  return matches;
}
