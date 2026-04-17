import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TypePanel } from '../../src/ui/TypePanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('add and rename a type updates refs', async () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      types: { User: { kind: 'object', fields: [] } },
      endpoints: [{
        id: 'e1', method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null,
        responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
        auth: 'inherit', useProxy: 'inherit',
      }],
    },
    fileHandle: null, dirty: false,
  });
  render(<TypePanel />);
  const input = screen.getByLabelText('Type name') as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, 'Account');
  input.blur();
  await screen.findByText('Account');
  const { endpoints } = useSpecStore.getState().spec;
  expect(endpoints[0]!.responses[0]!.type).toEqual({ kind: 'ref', ref: 'Account' });
});
