import { expect, test } from 'vitest';
import { resolveBootIntent } from '../../src/state/boot';

test('empty search returns kind: none', () => {
  expect(resolveBootIntent('')).toEqual({ kind: 'none' });
});

test('?spec=<https url> returns load-url', () => {
  expect(resolveBootIntent('?spec=https://example.com/spec.json')).toEqual({
    kind: 'load-url',
    url: 'https://example.com/spec.json',
  });
});

test('?spec=<http url> returns load-url', () => {
  expect(resolveBootIntent('?spec=http://example.com/spec.json')).toEqual({
    kind: 'load-url',
    url: 'http://example.com/spec.json',
  });
});

test('?spec=<javascript:...> is silently rejected as kind: none', () => {
  expect(resolveBootIntent('?spec=javascript:alert(1)')).toEqual({ kind: 'none' });
});

test('?spec=<file:///...> is silently rejected as kind: none', () => {
  expect(resolveBootIntent('?spec=file:///tmp/spec.json')).toEqual({ kind: 'none' });
});

test('?specPath=<path> returns load-path', () => {
  expect(resolveBootIntent('?specPath=/users/me/spec.zwag')).toEqual({
    kind: 'load-path',
    path: '/users/me/spec.zwag',
  });
});

test('both ?spec and ?specPath: ?spec wins', () => {
  expect(resolveBootIntent('?spec=https://x/y.json&specPath=/a/b')).toEqual({
    kind: 'load-url',
    url: 'https://x/y.json',
  });
});

test('encoded URL value decodes correctly', () => {
  const encoded = encodeURIComponent('https://example.com/path with spaces.json');
  expect(resolveBootIntent(`?spec=${encoded}`)).toEqual({
    kind: 'load-url',
    url: 'https://example.com/path with spaces.json',
  });
});
