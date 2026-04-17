import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ResponseView } from '../../src/ui/ResponseView';

test('highlights path with error', () => {
  render(<ResponseView body={{ user: { age: 'x' } }} errors={[{ path: 'user.age', message: 'expected number, got string' }]} />);
  const marks = document.querySelectorAll('[data-error]');
  expect(marks.length).toBeGreaterThan(0);
});
