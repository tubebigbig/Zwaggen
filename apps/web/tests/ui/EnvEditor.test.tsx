import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvEditor } from '../../src/ui/EnvEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

test('add env and mark a var as secret', async () => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
  render(<EnvEditor />);
  await userEvent.click(screen.getByRole('button', { name: 'Add environment' }));
  expect(Object.keys(useSpecStore.getState().spec.environments)).toContain('env2');
  await userEvent.click(screen.getByRole('button', { name: 'Add variable' }));
  await userEvent.type(screen.getByLabelText('Variable name'), 'TOKEN');
  await userEvent.click(screen.getByLabelText('secret'));
  const envs = useSpecStore.getState().spec.environments;
  const active = envs[useSpecStore.getState().spec.activeEnvironment]!;
  expect(active.variables[0]).toMatchObject({ name: 'TOKEN', secret: true });
});
