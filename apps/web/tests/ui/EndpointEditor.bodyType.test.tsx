import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Endpoint } from '@zwaggen/core';

function seedSpec(endpoint: Endpoint): void {
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [endpoint] },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: endpoint.id,
  });
}

test('switching from JSON to urlencoded clears requestBody and shows the form-fields editor', async () => {
  seedSpec({
    id: 'e1', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'object', fields: [{ name: 'a', required: true, type: { kind: 'string' } }] },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  render(<EndpointEditor />);

  const select = screen.getByLabelText('Body type') as HTMLSelectElement;
  await userEvent.selectOptions(select, 'urlencoded');

  const ep = useSpecStore.getState().spec.endpoints[0]!;
  expect(ep.bodyContentType).toBe('urlencoded');
  expect(ep.requestBody).toBeNull();
  expect(ep.bodyForm).toEqual([]);
  // Form fields heading appears
  expect(screen.getByText('Form fields')).toBeInTheDocument();
});

test('switching from urlencoded back to JSON clears bodyContentType + bodyForm', async () => {
  seedSpec({
    id: 'e1', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [{ name: 'a', required: true, type: { kind: 'string' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  render(<EndpointEditor />);

  const select = screen.getByLabelText('Body type') as HTMLSelectElement;
  await userEvent.selectOptions(select, 'json');

  const ep = useSpecStore.getState().spec.endpoints[0]!;
  expect(ep.bodyContentType).toBeUndefined();
  expect(ep.bodyForm).toBeUndefined();
});

test('switching from urlencoded to multipart preserves bodyForm fields', async () => {
  seedSpec({
    id: 'e1', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [{ name: 'username', required: true, type: { kind: 'string' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  render(<EndpointEditor />);

  const select = screen.getByLabelText('Body type') as HTMLSelectElement;
  await userEvent.selectOptions(select, 'multipart');

  const ep = useSpecStore.getState().spec.endpoints[0]!;
  expect(ep.bodyContentType).toBe('multipart');
  expect(ep.bodyForm).toEqual([{ name: 'username', required: true, type: { kind: 'string' } }]);
});

test('JSON body type retains the existing has-body checkbox toggle', async () => {
  seedSpec({
    id: 'e1', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  render(<EndpointEditor />);

  // has-body checkbox is rendered for JSON
  const checkbox = screen.getByLabelText('has body') as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  await userEvent.click(checkbox);
  expect(useSpecStore.getState().spec.endpoints[0]!.requestBody).toEqual({ kind: 'object', fields: [] });
});
