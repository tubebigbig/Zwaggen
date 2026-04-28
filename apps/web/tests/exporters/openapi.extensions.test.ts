import { describe, expect, it } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec, type Endpoint } from '@zwaggen/core';

function specWith(endpointPatch: Partial<Endpoint>) {
  const spec = emptySpec();
  spec.endpoints = [{
    id: 'e1', method: 'GET', path: '/x',
    pathParams: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: 'inherit',
    ...endpointPatch,
  }];
  return spec;
}

describe('toOpenApi — endpoint.extensions', () => {
  it('re-emits x-* keys onto the operation', () => {
    const doc: any = toOpenApi(specWith({
      extensions: {
        'x-codeSamples': [{ lang: 'curl', source: 'curl /x' }],
        'x-internal': true,
      },
    }));
    const op = doc.paths['/x'].get;
    expect(op['x-codeSamples']).toEqual([{ lang: 'curl', source: 'curl /x' }]);
    expect(op['x-internal']).toBe(true);
  });

  it('omits extension keys that would collide with Zwaggen-written keys', () => {
    const doc: any = toOpenApi(specWith({
      folder: 'real-folder',
      extensions: { 'x-folder': 'hijack-attempt' },
    }));
    const op = doc.paths['/x'].get;
    expect(op['x-folder']).toBe('real-folder');
  });

  it('produces no extension keys when extensions is undefined', () => {
    const doc: any = toOpenApi(specWith({}));
    const op = doc.paths['/x'].get;
    for (const k of Object.keys(op)) expect(k.startsWith('x-')).toBe(false);
  });
});
