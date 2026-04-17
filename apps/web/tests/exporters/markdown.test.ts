import { expect, test } from 'vitest';
import { toMarkdown } from '../../src/exporters/markdown';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

import { it, describe } from 'vitest';

function makeEndpoint(id: string, method: string, path: string, tags?: string[]): Endpoint {
  return {
    id,
    method: method as Endpoint['method'],
    path,
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody: null,
    responses: [],
    auth: 'inherit',
    useProxy: 'inherit',
    description: '',
    tags,
  };
}

describe('toMarkdown base URL', () => {
  it('includes a Base URL line when info.baseUrl is set', () => {
    const s = emptySpec();
    s.info.baseUrl = 'https://api.example.com';
    expect(toMarkdown(s)).toContain('**Base URL:** `https://api.example.com`');
  });

  it('omits the Base URL line when absent', () => {
    expect(toMarkdown(emptySpec())).not.toContain('**Base URL:**');
  });
});

test('renders a section per endpoint with tables', () => {
  const s = emptySpec('MyAPI');
  s.endpoints.push({
    id: 'e1', method: 'GET', path: '/u/{id}',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
    queryParams: [], headers: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] } }],
    auth: 'inherit', useProxy: 'inherit', description: 'Fetch user',
  });
  const md = toMarkdown(s);
  expect(md).toContain('# MyAPI');
  expect(md).toContain('## GET /u/{id}');
  expect(md).toContain('| id | string | yes |');
  expect(md).toContain('### Responses');
  expect(md).toContain('#### 200');
});

describe('toMarkdown tag sections', () => {
  it('sections endpoints by primary tag', () => {
    const s = emptySpec();
    s.endpoints.push(
      makeEndpoint('e1', 'GET', '/users', ['users']),
      makeEndpoint('e2', 'GET', '/admin', ['admin']),
    );
    const md = toMarkdown(s);
    expect(md).toContain('## users');
    expect(md).toContain('## admin');
    expect(md.indexOf('## admin')).toBeLessThan(md.indexOf('## users')); // alphabetical
  });

  it('places a multi-tag endpoint under its primary (first) tag only', () => {
    const s = emptySpec();
    s.endpoints.push(makeEndpoint('e1', 'GET', '/x', ['alpha', 'beta']));
    const md = toMarkdown(s);
    expect(md).toContain('## alpha');
    expect(md).not.toContain('## beta'); // beta is secondary — not emitted as a section
    // /x appears exactly once:
    const occurrences = (md.match(/### GET \/x/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('renders Untagged section after tagged sections when both exist', () => {
    const s = emptySpec();
    s.endpoints.push(
      makeEndpoint('e1', 'GET', '/a', ['alpha']),
      makeEndpoint('e2', 'GET', '/b'),
    );
    const md = toMarkdown(s);
    expect(md).toContain('## alpha');
    expect(md).toContain('## Untagged');
    expect(md.indexOf('## Untagged')).toBeGreaterThan(md.indexOf('## alpha'));
  });

  it('omits tag sectioning entirely when all endpoints are untagged', () => {
    const s = emptySpec();
    s.endpoints.push(makeEndpoint('e1', 'GET', '/x'));
    const md = toMarkdown(s);
    expect(md).not.toContain('## Untagged');
    expect(md).toContain('## GET /x'); // endpoint heading at H2 in flat mode
  });
});
