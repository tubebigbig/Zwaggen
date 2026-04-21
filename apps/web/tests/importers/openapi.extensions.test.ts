import { describe, expect, it } from 'vitest';
import { fromOpenApi } from '../../src/importers/openapi';

function opDoc(op: Record<string, unknown>) {
  return {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: { '/x': { get: op } },
  };
}

describe('fromOpenApi — x-* extensions on operations', () => {
  it('captures x-codeSamples and x-internal onto endpoint.extensions', () => {
    const doc = opDoc({
      responses: { '200': { description: 'ok' } },
      'x-codeSamples': [{ lang: 'curl', source: 'curl -X GET /x' }],
      'x-internal': true,
    });
    const { spec, warnings } = fromOpenApi(doc);
    expect(warnings).toEqual([]);
    const ep = spec.endpoints[0]!;
    expect(ep.extensions).toEqual({
      'x-codeSamples': [{ lang: 'curl', source: 'curl -X GET /x' }],
      'x-internal': true,
    });
  });

  it('keeps x-folder semantic and does not duplicate into extensions', () => {
    const doc = opDoc({
      responses: { '200': { description: 'ok' } },
      'x-folder': 'admin',
      'x-internal': true,
    });
    const { spec } = fromOpenApi(doc);
    const ep = spec.endpoints[0]!;
    expect(ep.folder).toBe('admin');
    expect(ep.extensions).toEqual({ 'x-internal': true });
    expect(ep.extensions).not.toHaveProperty('x-folder');
  });

  it('leaves extensions undefined when no x-* keys match', () => {
    const doc = opDoc({ responses: { '200': { description: 'ok' } } });
    const { spec } = fromOpenApi(doc);
    expect(spec.endpoints[0]!.extensions).toBeUndefined();
  });
});
