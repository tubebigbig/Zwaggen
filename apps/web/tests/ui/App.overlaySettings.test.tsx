import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/App';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { setUiPref } from '../../src/state/uiPrefs';

type Listener = (e: MediaQueryListEvent) => void;

function installMatchMedia(wide: boolean) {
  const byQuery = new Map<string, { matches: boolean; listeners: Set<Listener> }>();
  (window as any).matchMedia = (q: string) => {
    let entry = byQuery.get(q);
    if (!entry) {
      const matches = q.includes('1200') ? wide : false;
      entry = { matches, listeners: new Set() };
      byQuery.set(q, entry);
    }
    const current = entry;
    return {
      get matches() { return current.matches; },
      media: q,
      onchange: null,
      addEventListener: (_: string, cb: Listener) => { current.listeners.add(cb); },
      removeEventListener: (_: string, cb: Listener) => { current.listeners.delete(cb); },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };
  return {
    setWide(next: boolean) {
      for (const [q, entry] of byQuery) {
        const shouldMatch = q.includes('1200') ? next : entry.matches;
        if (shouldMatch !== entry.matches) {
          entry.matches = shouldMatch;
          entry.listeners.forEach((l) => l({ matches: shouldMatch } as MediaQueryListEvent));
        }
      }
    },
  };
}

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec('T'), fileHandle: null, dirty: false });
  setUiPref('sidebarCollapsed', false);
});

test('narrow viewport: settings renders as rail; expanding shows overlay with backdrop', async () => {
  const ctrl = installMatchMedia(false);
  const user = userEvent.setup();
  render(<App />);

  const rail = screen.getByRole('button', { name: /Expand Environment|Expand 環境/i });
  expect(rail).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /^Settings$|^設定$/ })).not.toBeInTheDocument();

  await user.click(rail);
  expect(screen.getByRole('heading', { name: /^Settings$|^設定$/ })).toBeVisible();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('heading', { name: /^Settings$|^設定$/ })).not.toBeInTheDocument();

  act(() => ctrl.setWide(true));
  expect(screen.getByRole('heading', { name: /^Settings$|^設定$/ })).toBeVisible();
});
