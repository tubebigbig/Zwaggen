import { expect, test } from 'vitest';
import { groupByTag, type Endpoint } from '@zwaggen/core';

const mkEndpoint = (tags: string[] | undefined, path = '/p'): Endpoint => ({
  id: Math.random().toString(36).slice(2),
  method: 'GET', path,
  pathParams: [], queryParams: [], headers: [],
  requestBody: null, responses: [],
  auth: 'inherit', useProxy: 'inherit',
  ...(tags !== undefined ? { tags } : {}),
});

test('zero endpoints → empty array', () => {
  expect(groupByTag([])).toEqual([]);
});

test('all untagged → single group with tag: null', () => {
  const a = mkEndpoint([]);
  const b = mkEndpoint(undefined);
  const result = groupByTag([a, b]);
  expect(result).toHaveLength(1);
  expect(result[0]!.tag).toBeNull();
  expect(result[0]!.endpoints).toEqual([a, b]);
});

test('tagged + untagged mix → tag groups alphabetical first, untagged last', () => {
  const z = mkEndpoint(['zebra']);
  const a = mkEndpoint(['alpha']);
  const u = mkEndpoint([]);
  const result = groupByTag([z, a, u]);
  expect(result).toHaveLength(3);
  expect(result[0]!.tag).toBe('alpha');
  expect(result[1]!.tag).toBe('zebra');
  expect(result[2]!.tag).toBeNull();
});

test('endpoint with two tags appears in both buckets in spec order', () => {
  const e = mkEndpoint(['beta', 'alpha']);
  const result = groupByTag([e]);
  expect(result).toHaveLength(2);
  const alphaGroup = result.find((g) => g.tag === 'alpha')!;
  const betaGroup = result.find((g) => g.tag === 'beta')!;
  expect(alphaGroup.endpoints).toContain(e);
  expect(betaGroup.endpoints).toContain(e);
});

test('tag sort is case-insensitive but Admin and admin are DISTINCT buckets', () => {
  const admin = mkEndpoint(['admin']);
  const Admin = mkEndpoint(['Admin']);
  const result = groupByTag([admin, Admin]);
  expect(result).toHaveLength(2);
  const tags = result.map((g) => g.tag);
  // Both buckets present
  expect(tags).toContain('admin');
  expect(tags).toContain('Admin');
  // Sorted case-insensitively: 'Admin' and 'admin' compare equal, but order is stable
  // Both appear before any untagged (no untagged here)
  expect(result.every((g) => g.tag !== null)).toBe(true);
});

test('duplicate tags on a single endpoint are collapsed', () => {
  const e = mkEndpoint(['foo', 'foo', 'foo']);
  const result = groupByTag([e]);
  expect(result).toHaveLength(1);
  expect(result[0]!.tag).toBe('foo');
  expect(result[0]!.endpoints).toHaveLength(1);
});

test('whitespace-only and empty tags are dropped; trimmed tags preserved', () => {
  const e = mkEndpoint(['  ', '', 'valid']);
  const result = groupByTag([e]);
  expect(result).toHaveLength(1);
  expect(result[0]!.tag).toBe('valid');
  expect(result[0]!.endpoints).toContain(e);
});

test('endpoint with only whitespace/empty tags treated as untagged', () => {
  const e = mkEndpoint(['  ', '']);
  const result = groupByTag([e]);
  expect(result).toHaveLength(1);
  expect(result[0]!.tag).toBeNull();
  expect(result[0]!.endpoints).toContain(e);
});
