import { expect, test } from 'vitest';
import { toMarkdown } from '../../src/exporters/markdown';
import { emptySpec } from '../../src/schema/defaults';

import { it, describe } from 'vitest';

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
