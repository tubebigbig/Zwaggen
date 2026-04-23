import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';

function specWithEndpoint(): Spec {
  const s = emptySpec();
  s.endpoints = [{
    id: 'e1', method: 'GET', path: '/test',
    pathParams: [],
    requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  }];
  return s;
}

it('initializes the Base URL input from spec.info.baseUrl', async () => {
  const s = specWithEndpoint();
  s.info.baseUrl = 'https://api.example.com';
  await useSpecStore.getState().replaceSpec(s, null);
  useSpecStore.getState().selectEndpoint(s.endpoints[0]!.id);

  render(<RunPanel />);
  const input = screen.getByLabelText('Base URL');
  expect(input).toHaveValue('https://api.example.com');
});

it('resyncs the Base URL input when spec.info.baseUrl changes', async () => {
  const s = specWithEndpoint();
  await useSpecStore.getState().replaceSpec(s, null);
  useSpecStore.getState().selectEndpoint(s.endpoints[0]!.id);

  const { rerender } = render(<RunPanel />);

  // Flush HistoryDrawer's async loadHistory().then(setEntries) effect so
  // its setState lands inside act, not after the next test assertion.
  await act(async () => { await Promise.resolve(); });

  expect(screen.getByLabelText('Base URL')).toHaveValue('');

  await act(async () => {
    await useSpecStore.getState().setSpec({
      ...useSpecStore.getState().spec,
      info: { ...useSpecStore.getState().spec.info, baseUrl: 'https://new.example' },
    });
  });
  rerender(<RunPanel />);
  await waitFor(() => {
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://new.example');
  });
});

it('editing the input does not mutate the spec', async () => {
  const s = specWithEndpoint();
  s.info.baseUrl = 'https://api.example.com';
  await useSpecStore.getState().replaceSpec(s, null);
  useSpecStore.getState().selectEndpoint(s.endpoints[0]!.id);

  render(<RunPanel />);
  const input = screen.getByLabelText('Base URL');
  await userEvent.clear(input);
  await userEvent.type(input, 'https://override.example');

  expect(useSpecStore.getState().spec.info.baseUrl).toBe('https://api.example.com');
});
