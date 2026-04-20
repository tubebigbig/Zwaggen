import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  return { ...emptySpec(), ...overrides };
}

function baseEndpoint(requestBody: Spec['endpoints'][number]['requestBody']) {
  return {
    id: 'e1',
    method: 'POST' as const,
    path: '/test',
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
  };
}

async function setup(spec: Spec) {
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint('e1');
}

it('ref → object-with-example: button enabled, click fills textarea', async () => {
  const user = userEvent.setup();
  const spec = makeSpec({
    types: {
      User: {
        kind: 'object',
        fields: [],
        example: { id: 'u_1', name: 'Alice' },
      },
    },
    endpoints: [baseEndpoint({ kind: 'ref', ref: 'User' })],
  });

  await setup(spec);
  render(<RunPanel />);

  const btn = screen.getByRole('button', { name: /seed from example/i });
  expect(btn).not.toBeDisabled();

  await user.click(btn);

  const textarea = screen.getByLabelText('Body');
  expect(textarea).toHaveValue(JSON.stringify({ id: 'u_1', name: 'Alice' }, null, 2));
});

it('no requestBody: body section and seed button are absent', async () => {
  const spec = makeSpec({
    endpoints: [baseEndpoint(null)],
  });

  await setup(spec);
  render(<RunPanel />);

  expect(screen.queryByLabelText('Body')).toBeNull();
  expect(screen.queryByRole('button', { name: /seed from example/i })).toBeNull();
});

it('primitive requestBody: seed button is disabled', async () => {
  const spec = makeSpec({
    endpoints: [baseEndpoint({ kind: 'string' })],
  });

  await setup(spec);
  render(<RunPanel />);

  const btn = screen.getByRole('button', { name: /seed from example/i });
  expect(btn).toBeDisabled();
});

it('object-without-example: seed button is disabled', async () => {
  const spec = makeSpec({
    endpoints: [baseEndpoint({ kind: 'object', fields: [] })],
  });

  await setup(spec);
  render(<RunPanel />);

  const btn = screen.getByRole('button', { name: /seed from example/i });
  expect(btn).toBeDisabled();
});
