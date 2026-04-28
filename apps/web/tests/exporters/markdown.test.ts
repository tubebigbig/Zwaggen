import { expect, test } from 'vitest';
import { toMarkdown } from '../../src/exporters/markdown';
import { emptySpec, type Endpoint } from '@zwaggen/core';

import { it, describe } from 'vitest';

function makeEndpoint(id: string, method: string, path: string, tags?: string[]): Endpoint {
  return {
    id,
    method: method as Endpoint['method'],
    path,
    pathParams: [],
    
    
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
     requestBody: null,
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

it('emits Example block for type with example', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [], example: { id: 'u_1' } };
  const md = toMarkdown(s);
  expect(md).toContain('#### Example');
  expect(md).toContain('"id": "u_1"');
});

it('omits Example block for type without example', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [] };
  expect(toMarkdown(s)).not.toContain('#### Example');
});

test('refs in param tables render as markdown links to the type section', () => {
  const spec = emptySpec();
  spec.types['User'] = { kind: 'object', fields: [] };
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/me',
    pathParams: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const md = toMarkdown(spec);
  expect(md).toContain('[User](#user)');
});

test('extending types render an Extends: line with clickable parents', () => {
  const spec = emptySpec();
  spec.types['Base'] = { kind: 'object', fields: [] };
  spec.types['User'] = { kind: 'object', extends: ['Base'], fields: [] };
  const md = toMarkdown(spec);
  expect(md).toContain('**Extends:** [Base](#base)');
});

test('emits ref placeholders in JSON skeleton blocks', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['Wrapper'] = {
    kind: 'object',
    fields: [{ name: 'u', required: true, type: { kind: 'ref', ref: 'auth/User' } }],
  };
  const md = toMarkdown(spec);
  // Refs inside fenced JSON blocks render as <ref:Name> rather than as
  // markdown links — the previous [name](#slug) format wasn't navigable
  // because markdown link syntax doesn't render inside code blocks.
  expect(md).toContain('<ref:auth/User>');
});
