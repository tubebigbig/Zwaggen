import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec, type Endpoint } from '@zwaggen/core';

function makeSpec(endpoint: Endpoint): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'http://api.example.com';
  s.endpoints = [endpoint];
  return s;
}

async function setup(endpoint: Endpoint) {
  const spec = makeSpec(endpoint);
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint(endpoint.id);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('renders ParamInputs for a urlencoded endpoint and POSTs form-encoded body', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchSpy);

  await setup({
    id: 'e1', method: 'POST', path: '/login',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [
      { name: 'username', required: true, type: { kind: 'string' } },
      { name: 'password', required: true, type: { kind: 'string' } },
    ],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  render(<RunPanel />);

  // The JSON body textarea must NOT be rendered for non-JSON content types.
  expect(screen.queryByLabelText('Body')).not.toBeInTheDocument();

  // Fill in the form fields and Send.
  const userInput = screen.getByLabelText('Form fields:username') as HTMLInputElement;
  const pwInput = screen.getByLabelText('Form fields:password') as HTMLInputElement;
  await userEvent.type(userInput, 'alice');
  await userEvent.type(pwInput, 's&p');

  await userEvent.click(screen.getByRole('button', { name: /^Send$|^Sending\.\.\.$/ }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBe('username=alice&password=s%26p');
  expect((init.headers as any)['content-type']).toBe('application/x-www-form-urlencoded');
});

it('renders ParamInputs for a multipart endpoint and POSTs FormData', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchSpy);

  await setup({
    id: 'e1', method: 'POST', path: '/upload',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [
      { name: 'field', required: true, type: { kind: 'string' } },
    ],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  render(<RunPanel />);

  await userEvent.type(screen.getByLabelText('Form fields:field') as HTMLInputElement, 'value');
  await userEvent.click(screen.getByRole('button', { name: /^Send$|^Sending\.\.\.$/ }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get('field')).toBe('value');
  // Content-Type left undefined so fetch supplies the multipart boundary.
  expect((init.headers as any)['content-type']).toBeUndefined();
});

it('renders the JSON body textarea for json (default) endpoints', async () => {
  await setup({
    id: 'e1', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'object', fields: [{ name: 'a', required: true, type: { kind: 'string' } }] },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  render(<RunPanel />);
  expect(screen.getByLabelText('Body')).toBeInTheDocument();
  expect(screen.queryByText('Form fields')).not.toBeInTheDocument();
});
