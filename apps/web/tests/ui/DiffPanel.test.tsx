import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiffPanel } from '../../src/ui/DiffPanel';
import { emptySpec, type Spec } from '@zwaggen/core';

function specWithEndpoint(method: string, path: string): Spec {
  return {
    ...emptySpec(),
    endpoints: [
      {
        id: `${method}-${path}`,
        method: method as Spec['endpoints'][number]['method'],
        path,
        description: '',
        tags: [],
        pathParams: [],
        requestBody: null,
        responses: [],
        auth: 'inherit',
        useProxy: 'inherit',
        assertions: {},
        captures: [],
      },
    ],
  };
}

test('renders breaking and non-breaking counts when specs differ', () => {
  const base = specWithEndpoint('GET', '/x');
  const current = specWithEndpoint('GET', '/y');

  render(<DiffPanel base={base} current={current} onClose={vi.fn()} />);

  // GET /x removed => 1 breaking; GET /y added => 1 non-breaking
  // Text appears in both the summary span and section h3, so use getAllByText
  expect(screen.getAllByText(/1 breaking/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/1 non-breaking/i).length).toBeGreaterThan(0);
});

test('renders breaking row with expected kind and location', () => {
  const base = specWithEndpoint('GET', '/x');
  const current = specWithEndpoint('GET', '/y');

  render(<DiffPanel base={base} current={current} onClose={vi.fn()} />);

  expect(screen.getByText('endpoint.removed')).toBeTruthy();
  expect(screen.getByText('GET /x')).toBeTruthy();
});

test('renders non-breaking row with expected kind and location', () => {
  const base = specWithEndpoint('GET', '/x');
  const current = specWithEndpoint('GET', '/y');

  render(<DiffPanel base={base} current={current} onClose={vi.fn()} />);

  expect(screen.getByText('endpoint.added')).toBeTruthy();
  expect(screen.getByText('GET /y')).toBeTruthy();
});

test('shows "No differences." when specs are identical', () => {
  const spec = emptySpec();

  render(<DiffPanel base={spec} current={spec} onClose={vi.fn()} />);

  expect(screen.getByText('No differences.')).toBeTruthy();
});

test('close button triggers onClose', async () => {
  const onClose = vi.fn();
  const spec = emptySpec();

  render(<DiffPanel base={spec} current={spec} onClose={onClose} />);

  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(onClose).toHaveBeenCalledOnce();
});

test('dialog has accessible label', () => {
  const spec = emptySpec();

  render(<DiffPanel base={spec} current={spec} onClose={vi.fn()} />);

  expect(screen.getByRole('dialog', { name: /Spec changes/i })).toBeTruthy();
});
