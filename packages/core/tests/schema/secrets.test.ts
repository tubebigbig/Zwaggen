import { expect, test } from 'vitest';
import { stripSecrets, extractSecrets } from '../../src/schema/serialize';
import { emptySpec } from '../../src/schema/defaults';

test('stripSecrets clears secret values; extractSecrets returns them', () => {
  const s = emptySpec();
  s.environments.default!.variables.push(
    { name: 'TOKEN', value: 'abc', secret: true },
    { name: 'BASE', value: 'http://x', secret: false },
  );
  const stripped = stripSecrets(s);
  expect(stripped.environments.default!.variables[0]!.value).toBe('');
  expect(stripped.environments.default!.variables[1]!.value).toBe('http://x');
  expect(extractSecrets(s)).toEqual({ default: { TOKEN: 'abc' } });
});
