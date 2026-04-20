import { expect, it, describe } from 'vitest';
import { diffSpecs, emptySpec, type Endpoint } from '@zwaggen/core';

type Opts = Partial<Endpoint> & { method?: string; path?: string };
function mkEndpoint(opts: Opts = {}): Endpoint {
  return {
    id: 'e-' + Math.random().toString(36).slice(2),
    method: 'GET',
    path: '/x',
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody: null,
    responses: [],
    auth: 'inherit',
    useProxy: 'inherit',
    ...opts,
  } as Endpoint;
}

describe('diffSpecs — endpoints', () => {
  it('1. identical specs → no changes', () => {
    const ep = mkEndpoint({ method: 'GET', path: '/foo' });
    const a = { ...emptySpec(), endpoints: [ep] };
    const b = { ...emptySpec(), endpoints: [{ ...ep }] };
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toEqual([]);
  });

  it('2. endpoint added in b → nonBreaking endpoint.added', () => {
    const a = emptySpec();
    const b = { ...emptySpec(), endpoints: [mkEndpoint({ method: 'POST', path: '/new' })] };
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.added');
  });

  it('3. endpoint removed from b → breaking endpoint.removed', () => {
    const a = { ...emptySpec(), endpoints: [mkEndpoint({ method: 'GET', path: '/old' })] };
    const b = emptySpec();
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.removed');
    expect(result.nonBreaking).toEqual([]);
  });

  it('4. description changed → nonBreaking endpoint.description.changed', () => {
    const a = { ...emptySpec(), endpoints: [mkEndpoint({ description: 'old desc' })] };
    const b = { ...emptySpec(), endpoints: [mkEndpoint({ description: 'new desc' })] };
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.description.changed');
  });

  it('5. tags changed → nonBreaking endpoint.tags.changed', () => {
    const a = { ...emptySpec(), endpoints: [mkEndpoint({ tags: ['v1'] })] };
    const b = { ...emptySpec(), endpoints: [mkEndpoint({ tags: ['v2'] })] };
    const result = diffSpecs(a, b);
    expect(result.breaking).toEqual([]);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.tags.changed');
  });

  it('6. required param added → breaking endpoint.param.required-added', () => {
    const a = { ...emptySpec(), endpoints: [mkEndpoint()] };
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: true, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.param.required-added');
  });

  it('7. optional param added → nonBreaking endpoint.param.optional-added', () => {
    const a = { ...emptySpec(), endpoints: [mkEndpoint()] };
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: false, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.param.optional-added');
    expect(result.breaking).toEqual([]);
  });

  it('8. required param removed → breaking endpoint.param.removed', () => {
    const a = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: true, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const b = { ...emptySpec(), endpoints: [mkEndpoint()] };
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.param.removed');
  });

  it('9. optional param removed → nonBreaking endpoint.param.removed', () => {
    const a = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: false, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const b = { ...emptySpec(), endpoints: [mkEndpoint()] };
    const result = diffSpecs(a, b);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.param.removed');
    expect(result.breaking).toEqual([]);
  });

  it('10. param required flipped false→true → breaking endpoint.param.required-flipped-to-true', () => {
    const a = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: false, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: true, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.param.required-flipped-to-true');
  });

  it('11. param required flipped true→false → nonBreaking endpoint.param.required-flipped-to-false', () => {
    const a = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: true, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: false, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.param.required-flipped-to-false');
    expect(result.breaking).toEqual([]);
  });

  it('12. param type changed → breaking endpoint.param.type.changed', () => {
    const a = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: false, type: { kind: 'string' as const } }],
        }),
      ],
    };
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({
          queryParams: [{ name: 'q', required: false, type: { kind: 'integer' as const } }],
        }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.param.type.changed');
  });

  it('13. requestBody added → breaking endpoint.requestBody.added', () => {
    const a = { ...emptySpec(), endpoints: [mkEndpoint({ requestBody: null })] };
    const b = {
      ...emptySpec(),
      endpoints: [mkEndpoint({ requestBody: { kind: 'object' as const, fields: [] } })],
    };
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.requestBody.added');
    expect(result.nonBreaking).toEqual([]);
  });

  it('14. requestBody removed → nonBreaking endpoint.requestBody.removed', () => {
    const a = {
      ...emptySpec(),
      endpoints: [mkEndpoint({ requestBody: { kind: 'object' as const, fields: [] } })],
    };
    const b = { ...emptySpec(), endpoints: [mkEndpoint({ requestBody: null })] };
    const result = diffSpecs(a, b);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.requestBody.removed');
    expect(result.breaking).toEqual([]);
  });

  it('15. requestBody type changed → breaking endpoint.requestBody.type.changed', () => {
    const a = {
      ...emptySpec(),
      endpoints: [mkEndpoint({ requestBody: { kind: 'string' as const } })],
    };
    const b = {
      ...emptySpec(),
      endpoints: [mkEndpoint({ requestBody: { kind: 'integer' as const } })],
    };
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.requestBody.type.changed');
  });

  it('16. response status added → nonBreaking endpoint.response.added', () => {
    const a = { ...emptySpec(), endpoints: [mkEndpoint({ responses: [] })] };
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({ responses: [{ status: 201, type: { kind: 'string' as const } }] }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.response.added');
    expect(result.breaking).toEqual([]);
  });

  it('17. response status removed → nonBreaking endpoint.response.removed', () => {
    const a = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({ responses: [{ status: 200, type: { kind: 'string' as const } }] }),
      ],
    };
    const b = { ...emptySpec(), endpoints: [mkEndpoint({ responses: [] })] };
    const result = diffSpecs(a, b);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.response.removed');
    expect(result.breaking).toEqual([]);
  });

  it('18. response type changed for shared status → breaking endpoint.response.type.changed', () => {
    const a = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({ responses: [{ status: 200, type: { kind: 'string' as const } }] }),
      ],
    };
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({ responses: [{ status: 200, type: { kind: 'integer' as const } }] }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]!.kind).toBe('endpoint.response.type.changed');
  });

  it('19. deterministic sort: two changes across non-alphabetical endpoints → sorted by kind then location', () => {
    // Two endpoints: POST /z (added) and POST /a (added)
    // They should be sorted by location after kind is equal
    const a = emptySpec();
    const b = {
      ...emptySpec(),
      endpoints: [
        mkEndpoint({ method: 'POST', path: '/z' }),
        mkEndpoint({ method: 'POST', path: '/a' }),
      ],
    };
    const result = diffSpecs(a, b);
    expect(result.nonBreaking).toHaveLength(2);
    expect(result.nonBreaking[0]!.kind).toBe('endpoint.added');
    expect(result.nonBreaking[1]!.kind).toBe('endpoint.added');
    // Sorted by location: POST /a before POST /z
    expect(result.nonBreaking[0]!.location).toBe('POST /a');
    expect(result.nonBreaking[1]!.location).toBe('POST /z');
  });
});
