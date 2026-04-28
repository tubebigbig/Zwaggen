import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { EndpointList } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  const s = emptySpec();
  s.endpoints = [
    {
      id: 'a', method: 'GET', path: '/x', pathParams: [],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit', folder: 'auth',
    },
  ];
  await useSpecStore.getState().replaceSpec(s, null);
});

it('clicking + on a folder row creates a new endpoint in that folder and selects it', async () => {
  render(<EndpointList />);

  // Find the "auth" folder header (a button with the folder name) then climb
  // to the row container that wraps both the toggle button and the actions.
  const folderHeader = screen.getByText('auth');
  // The container with class "group" is the flex row that holds the folder
  // toggle + the actions cluster.
  const row = folderHeader.closest('.group') as HTMLElement;
  expect(row).not.toBeNull();

  const addBtn = within(row).getByRole('button', { name: /add endpoint to this folder/i });
  await userEvent.click(addBtn);

  const eps = useSpecStore.getState().spec.endpoints;
  expect(eps).toHaveLength(2);
  const newEp = eps.find((e) => e.id !== 'a')!;
  expect(newEp.folder).toBe('auth');
  expect(newEp.method).toBe('GET');
  expect(useSpecStore.getState().selectedEndpointId).toBe(newEp.id);
});
