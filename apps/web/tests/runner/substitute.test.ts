import { expect, test } from 'vitest';
import { substitute } from '@zwaggen/core';

test('substitutes known vars', () => {
  const { text, missing } = substitute('hi {{name}}!', { name: 'world' });
  expect(text).toBe('hi world!');
  expect(missing).toEqual([]);
});

test('leaves unknown vars and reports them', () => {
  const { text, missing } = substitute('{{a}}/{{b}}', { a: '1' });
  expect(text).toBe('1/{{b}}');
  expect(missing).toEqual(['b']);
});

test('handles whitespace in braces', () => {
  expect(substitute('{{ name }}', { name: 'x' }).text).toBe('x');
});
