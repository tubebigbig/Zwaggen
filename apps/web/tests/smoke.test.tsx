import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

test('renders title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /gen-spec/ })).toBeInTheDocument();
});
