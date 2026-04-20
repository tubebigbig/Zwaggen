import { expect, test } from 'vitest';
import { renameType, collectBrokenRefs, renameFolder } from '../../src/schema/rename';
import { emptySpec } from '../../src/schema/defaults';

test('renames a type and updates refs deeply', () => {
  const spec = emptySpec();
  spec.types.User = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/u', pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const next = renameType(spec, 'User', 'Account');
  expect(next.types.Account).toBeDefined();
  expect(next.types.User).toBeUndefined();
  expect(next.endpoints[0]!.responses[0]!.type).toEqual({ kind: 'ref', ref: 'Account' });
});

test('collectBrokenRefs finds dangling references', () => {
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/x', pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  expect(collectBrokenRefs(spec)).toEqual([
    { location: 'endpoint:e1:requestBody', ref: 'Missing' },
  ]);
});

test('renameFolder rewrites every descendant type key and ref', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  spec.types['auth/admin/Session'] = {
    kind: 'object',
    fields: [{ name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } }],
  };
  spec.types['other/Order'] = { kind: 'object', fields: [] };
  spec.endpoints.push({
    id: 'e1', method: 'POST', path: '/login', pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'auth/User' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });

  const next = renameFolder(spec, 'auth', 'identity');

  expect(next.types['identity/User']).toBeDefined();
  expect(next.types['identity/admin/Session']).toBeDefined();
  expect(next.types['auth/User']).toBeUndefined();
  expect(next.types['auth/admin/Session']).toBeUndefined();
  expect(next.types['other/Order']).toBeDefined();

  // refs updated
  const session = next.types['identity/admin/Session'] as { kind: 'object'; fields: Array<{ type: { kind: string; ref?: string } }> };
  expect(session.fields[0]!.type).toEqual({ kind: 'ref', ref: 'identity/User' });
  expect(next.endpoints[0]!.requestBody).toEqual({ kind: 'ref', ref: 'identity/User' });
});

test('renameFolder rewrites endpoint.folder on every matching endpoint', () => {
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'a', method: 'GET', path: '/a', folder: 'users/admin',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  spec.endpoints.push({
    id: 'b', method: 'GET', path: '/b', folder: 'users',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  spec.endpoints.push({
    id: 'c', method: 'GET', path: '/c', folder: 'other',
    pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  const next = renameFolder(spec, 'users', 'members');
  expect(next.endpoints[0]!.folder).toBe('members/admin');
  expect(next.endpoints[1]!.folder).toBe('members');
  expect(next.endpoints[2]!.folder).toBe('other');
});

test('renameFolder is a no-op when no items match', () => {
  const spec = emptySpec();
  spec.types.User = { kind: 'object', fields: [] };
  const next = renameFolder(spec, 'missing', 'new');
  expect(next).toEqual(spec);
});
