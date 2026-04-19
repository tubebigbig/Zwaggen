import { act, renderHook } from '@testing-library/react';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: (_: string, cb: Listener) => { listeners.add(cb); },
    removeEventListener: (_: string, cb: Listener) => { listeners.delete(cb); },
    addListener: () => {}, // legacy
    removeListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  (window as any).matchMedia = () => mql;
  return {
    emit(matches: boolean) {
      (mql as any).matches = matches;
      listeners.forEach((l) => l({ matches } as MediaQueryListEvent));
    },
  };
}

test('returns initial matches and updates on change', () => {
  const ctrl = mockMatchMedia(false);
  const { result } = renderHook(() => useBreakpoint('(min-width: 1200px)'));
  expect(result.current).toBe(false);
  act(() => ctrl.emit(true));
  expect(result.current).toBe(true);
  act(() => ctrl.emit(false));
  expect(result.current).toBe(false);
});
