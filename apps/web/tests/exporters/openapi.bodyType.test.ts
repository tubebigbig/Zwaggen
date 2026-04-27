import { expect, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { fromOpenApi } from '../../src/importers/openapi';
import { emptySpec, type Endpoint } from '@zwaggen/core';

function urlencodedEndpoint(): Endpoint {
  return {
    id: 'e1', method: 'POST', path: '/login',
    pathParams: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [
      { name: 'username', required: true, type: { kind: 'string' } },
      { name: 'password', required: true, type: { kind: 'string' } },
    ],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
}

function multipartEndpoint(): Endpoint {
  return {
    id: 'e2', method: 'POST', path: '/upload',
    pathParams: [],
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [
      { name: 'note', required: true, type: { kind: 'string' } },
      { name: 'tag', required: false, type: { kind: 'string' } },
    ],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
}

test('exporter emits application/x-www-form-urlencoded for urlencoded endpoints', () => {
  const s = emptySpec();
  s.endpoints.push(urlencodedEndpoint());
  const out: any = toOpenApi(s);
  const op = out.paths['/login'].post;
  expect(op.requestBody.content['application/x-www-form-urlencoded'].schema).toEqual({
    type: 'object',
    properties: {
      username: { type: 'string' },
      password: { type: 'string' },
    },
    required: ['username', 'password'],
  });
  expect(op.requestBody.content['application/json']).toBeUndefined();
});

test('exporter emits multipart/form-data for multipart endpoints', () => {
  const s = emptySpec();
  s.endpoints.push(multipartEndpoint());
  const out: any = toOpenApi(s);
  const op = out.paths['/upload'].post;
  expect(op.requestBody.content['multipart/form-data'].schema).toEqual({
    type: 'object',
    properties: {
      note: { type: 'string' },
      tag: { type: 'string' },
    },
    required: ['note'],
  });
});

test('urlencoded body round-trips through OpenAPI export -> import', () => {
  const s = emptySpec();
  s.endpoints.push(urlencodedEndpoint());
  const oas: any = toOpenApi(s);
  const back = fromOpenApi(oas).spec;
  expect(back.endpoints[0]!.bodyContentType).toBe('urlencoded');
  expect(back.endpoints[0]!.bodyForm).toEqual(s.endpoints[0]!.bodyForm);
  expect(back.endpoints[0]!.requestBody).toBeNull();
});

test('multipart body round-trips through OpenAPI export -> import', () => {
  const s = emptySpec();
  s.endpoints.push(multipartEndpoint());
  const oas: any = toOpenApi(s);
  const back = fromOpenApi(oas).spec;
  expect(back.endpoints[0]!.bodyContentType).toBe('multipart');
  expect(back.endpoints[0]!.bodyForm).toEqual(s.endpoints[0]!.bodyForm);
  expect(back.endpoints[0]!.requestBody).toBeNull();
});

test('json body still round-trips unchanged', () => {
  const s = emptySpec();
  s.endpoints.push({
    id: 'e1', method: 'POST', path: '/x',
    pathParams: [],
    requestBody: { kind: 'object', fields: [{ name: 'a', required: true, type: { kind: 'string' } }] },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  const oas: any = toOpenApi(s);
  expect(oas.paths['/x'].post.requestBody.content['application/json']).toBeDefined();
  const back = fromOpenApi(oas).spec;
  expect(back.endpoints[0]!.bodyContentType).toBeUndefined();
  expect(back.endpoints[0]!.bodyForm).toBeUndefined();
  expect(back.endpoints[0]!.requestBody).toEqual({
    kind: 'object',
    fields: [{ name: 'a', required: true, type: { kind: 'string' } }],
  });
});
