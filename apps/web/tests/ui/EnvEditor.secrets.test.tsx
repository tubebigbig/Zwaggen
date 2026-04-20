import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { EnvEditor } from '../../src/ui/EnvEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

test('empty secret shows missing indicator', () => {
  const spec = emptySpec();
  spec.environments.default!.variables.push({ name: 'TOKEN', value: '', secret: true });
  useSpecStore.setState({ spec, fileHandle: null, dirty: false });
  render(<EnvEditor />);
  expect(screen.getByText('missing secret')).toBeInTheDocument();
});
