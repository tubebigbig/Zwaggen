import { describe, expect, test } from 'vitest';
import { findIllegalFileTypes } from '../../src/schema/validateFileType';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint, Spec } from '../../src/schema/types';

function specWith(partial: Partial<Spec>): Spec {
  return { ...emptySpec(), ...partial };
}

function ep(overrides: Partial<Endpoint>): Endpoint {
  return {
    id: 'e',
    method: 'POST',
    path: '/',
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody: null,
    responses: [],
    auth: 'inherit',
    useProxy: 'inherit',
    ...overrides,
  };
}

describe('findIllegalFileTypes', () => {
  test('empty spec returns no errors', () => {
    expect(findIllegalFileTypes(emptySpec())).toEqual([]);
  });

  test('flags file type in named types', () => {
    const spec = specWith({ types: { Foo: { kind: 'file' } } });
    const errs = findIllegalFileTypes(spec);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.where).toBe('types.Foo');
  });

  test('flags file type nested inside an array under a named type', () => {
    const spec = specWith({
      types: { Foo: { kind: 'array', element: { kind: 'file' } } },
    });
    expect(findIllegalFileTypes(spec)).toHaveLength(1);
  });

  test('flags file type nested inside an object field of a named type', () => {
    const spec = specWith({
      types: {
        Foo: {
          kind: 'object',
          fields: [{ name: 'attachment', required: true, type: { kind: 'file' } }],
        },
      },
    });
    expect(findIllegalFileTypes(spec)).toHaveLength(1);
  });

  test('flags file type in path/query/header params', () => {
    const spec = specWith({
      endpoints: [
        ep({
          id: 'e1',
          pathParams: [{ name: 'p', required: true, type: { kind: 'file' } }],
          queryParams: [{ name: 'q', required: true, type: { kind: 'file' } }],
          headers: [{ name: 'h', required: true, type: { kind: 'file' } }],
        }),
      ],
    });
    const errs = findIllegalFileTypes(spec);
    expect(errs).toHaveLength(3);
    expect(errs.map((e) => e.where).sort()).toEqual([
      'endpoints.e1.headers.h',
      'endpoints.e1.pathParams.p',
      'endpoints.e1.queryParams.q',
    ]);
  });

  test('flags file type in requestBody', () => {
    const spec = specWith({
      endpoints: [ep({ id: 'e1', requestBody: { kind: 'file' } })],
    });
    const errs = findIllegalFileTypes(spec);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.where).toBe('endpoints.e1.requestBody');
  });

  test('flags file type in responses', () => {
    const spec = specWith({
      endpoints: [ep({ id: 'e1', responses: [{ status: 200, type: { kind: 'file' } }] })],
    });
    const errs = findIllegalFileTypes(spec);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.where).toBe('endpoints.e1.responses[200]');
  });

  test('flags file type in urlencoded bodyForm', () => {
    const spec = specWith({
      endpoints: [
        ep({
          id: 'e1',
          bodyContentType: 'urlencoded',
          bodyForm: [{ name: 'attachment', required: true, type: { kind: 'file' } }],
        }),
      ],
    });
    const errs = findIllegalFileTypes(spec);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.where).toBe('endpoints.e1.bodyForm.attachment');
    expect(errs[0]!.message).toMatch(/multipart/);
  });

  test('flags file type in default-json bodyForm (bodyContentType absent)', () => {
    const spec = specWith({
      endpoints: [
        ep({
          id: 'e1',
          bodyForm: [{ name: 'attachment', required: true, type: { kind: 'file' } }],
        }),
      ],
    });
    const errs = findIllegalFileTypes(spec);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.where).toBe('endpoints.e1.bodyForm.attachment');
  });

  test('accepts file type in multipart bodyForm at the top level', () => {
    const spec = specWith({
      endpoints: [
        ep({
          id: 'e1',
          bodyContentType: 'multipart',
          bodyForm: [
            { name: 'note', required: true, type: { kind: 'string' } },
            { name: 'file', required: true, type: { kind: 'file' } },
          ],
        }),
      ],
    });
    expect(findIllegalFileTypes(spec)).toEqual([]);
  });

  test('flags nested file inside multipart bodyForm field', () => {
    const spec = specWith({
      endpoints: [
        ep({
          id: 'e1',
          bodyContentType: 'multipart',
          bodyForm: [
            {
              name: 'attachments',
              required: true,
              type: { kind: 'array', element: { kind: 'file' } },
            },
          ],
        }),
      ],
    });
    const errs = findIllegalFileTypes(spec);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.where).toBe('endpoints.e1.bodyForm.attachments');
    expect(errs[0]!.message).toMatch(/nested/);
  });

  test('collects multiple errors across the spec', () => {
    const spec = specWith({
      types: { Foo: { kind: 'file' } },
      endpoints: [
        ep({
          id: 'e1',
          requestBody: { kind: 'file' },
          bodyContentType: 'urlencoded',
          bodyForm: [{ name: 'a', required: true, type: { kind: 'file' } }],
        }),
      ],
    });
    expect(findIllegalFileTypes(spec).length).toBeGreaterThanOrEqual(3);
  });
});
