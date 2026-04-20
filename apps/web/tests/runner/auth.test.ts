import { expect, test } from 'vitest';
import { applyAuth } from '@zwaggen/core';

test('bearer adds header', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x') }, { type: 'bearer', token: 't' });
  expect(r.headers['Authorization']).toBe('Bearer t');
});
test('basic base64 encodes', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x') }, { type: 'basic', username: 'u', password: 'p' });
  expect(r.headers['Authorization']).toBe('Basic ' + btoa('u:p'));
});
test('api key in header', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x') }, { type: 'apiKey', in: 'header', name: 'X-Key', value: 'v' });
  expect(r.headers['X-Key']).toBe('v');
});
test('api key in query', () => {
  const r = applyAuth({ headers: {}, url: new URL('http://x/?a=1') }, { type: 'apiKey', in: 'query', name: 'k', value: 'v' });
  expect(r.url.searchParams.get('k')).toBe('v');
});
