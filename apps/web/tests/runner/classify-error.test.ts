import { expect, test } from 'vitest';
import { classifyError } from '../../src/runner/classify-error';

test('TypeError → cors-or-network', () => {
  expect(classifyError(new TypeError('Failed to fetch'))).toMatchObject({ kind: 'cors-or-network' });
});
test('AbortError → timeout', () => {
  const e = new Error('timeout');
  e.name = 'AbortError';
  expect(classifyError(e)).toMatchObject({ kind: 'timeout' });
});
