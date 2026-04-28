# Spec — Per-endpoint Markdown export tab

## Problem

Users want a per-endpoint Markdown cheatsheet for sharing one endpoint in a Slack/email/PR review — a human-readable cheatsheet with named sections (Info / Parameters / Success Response / Error Response), parameter tables, and example payloads. Today, the per-endpoint ExportPopover offers cURL / types.ts / schemas.ts / client.ts / openapi.json. The full-spec markdown exporter (`apps/web/src/exporters/markdown.ts`) produces a developer-reference tree with JSON skeletons — different shape, different audience.

This adds a 6th tab (**Markdown**) to the per-endpoint scope of ExportPopover, producing the user-supplied template format.

## Success criteria

- New tab in ExportPopover endpoint scope (between `client.ts` and `openapi.json` is fine — implementer's call). Filename: `{endpoint.id}.md`. Label: existing i18n key `exportTabMarkdown` (new, add).
- Output format follows the user's template:
  ```
  # {endpoint.path or short summary}
  {description}

  ## Info
  * URL: `{baseUrl}{path}`
  * Method: `GET` (etc.)
  * CSRF Required: (omitted in v1)
  * CSRF Format: (omitted in v1)

  ## Parameters
  ### Path params
  | name | type | required | description |
  | --- | --- | --- | --- |
  | id | string | yes | … |
  ### Query params
  (similar table; section omitted if no query params)
  ### Headers
  (similar table; section omitted if no headers)
  ### Body
  (table for object body; or JSON skeleton for array/primitive body; section omitted if no body)

  ## Success Response
  **Code**: 200
  **Format**: json
  **Data**:
  | field | type | description |
  | --- | --- | --- |
  | id | string | … |

  **Example**:
  ```json
  { … resolveExample output … }
  ```

  ## Error Response
  **Exceptions**:
  - 400 Bad Request
  - 404 Not Found
  - 500 Internal Server Error

  **Example**:
  ```json
  { "error": … resolveExample of the first error response … }
  ```
  ```
- CSRF lines OMITTED in v1 (per design call). Section "Info" only shows URL + Method.
- Success Response = the first response with `status` in 200-299. If none, section says `_None defined_`.
- Error Response = each response with `status` ≥ 400. Each becomes one bullet under `**Exceptions**`. Example block shows the FIRST error response's resolved example.
- Tables share the column shape `name | type | required | description` for params and `field | type | description` for response Data.
- `resolveExample(spec, type)` from `@zwaggen/core` powers the example JSON blocks.
- Format value defaults to `json` (Zwaggen specs are JSON-typed today; if a future schema change adds explicit content-type per response we'll surface it then).
- 1 new helper `endpointToMarkdown(ep, spec): string` in `apps/web/src/exporters/markdown.ts` (alongside the existing `toMarkdown`).
- 1 new i18n key `exportTabMarkdown` in en + zh-TW.
- Tests: render markdown for a fixture endpoint covering all 4 param locations + 1 success + 2 error responses; assert output contains expected section headings + table rows + example JSON.

## Out of scope

- **CSRF fields** — deferred. Schema bump or `extensions: x-csrf-required`/`x-csrf-format` lookups can land in a follow-up.
- **Folder-scope Markdown tab** — bundling N endpoint Markdown sections into one file. Probably useful, but not requested for v1.
- **Replacing the existing full-spec `toMarkdown`** in `bundle.ts`'s `api.md` output. The current full-spec exporter stays as-is; this is purely a per-endpoint addition.
- **Live preview panel Markdown tab** — only TS/Zod/Client/OpenAPI today; could add Markdown later if the user finds the per-endpoint format useful.
- **Per-type Markdown tab** — types are well-served by the TS / Zod / JSON Schema tabs already.
- **i18n of the section headings** — `## Info`, `## Parameters`, etc. stay English in both locales (per design call, English headings act as keywords).

## Approach

### `endpointToMarkdown` helper

Inside `apps/web/src/exporters/markdown.ts`:

```ts
export function endpointToMarkdown(ep: Endpoint, spec: Spec): string {
  const out: string[] = [];
  // Title: use description's first line if present, else "METHOD path"
  const title = ep.description?.split('\n')[0]?.trim() || `${ep.method} ${ep.path}`;
  out.push(`# ${title}`, '');
  if (ep.description) {
    const rest = ep.description.split('\n').slice(1).join('\n').trim();
    if (rest) out.push(rest, '');
  }

  // Info
  out.push('## Info', '');
  const fullUrl = `${spec.info.baseUrl ?? ''}${ep.path}`;
  out.push(`* URL: \`${fullUrl}\``);
  out.push(`* Method: \`${ep.method}\``);
  out.push('');

  // Parameters
  const sections = [
    { title: 'Path params', list: ep.pathParams },
    { title: 'Query params', list: resolveParamFields(ep.queryParams, spec) },
    { title: 'Headers', list: resolveParamFields(ep.headers, spec) },
  ].filter((s) => s.list.length > 0);

  if (sections.length || ep.requestBody) {
    out.push('## Parameters', '');
    for (const s of sections) {
      out.push(`### ${s.title}`, '');
      out.push(paramTableInline(s.list));
      out.push('');
    }
    if (ep.requestBody) {
      out.push('### Body', '');
      out.push(bodyForMarkdown(ep.requestBody, spec));
      out.push('');
    }
  }

  // Success
  out.push('## Success Response', '');
  const success = ep.responses.find((r) => r.status >= 200 && r.status < 300);
  if (!success) {
    out.push('_None defined_', '');
  } else {
    out.push(`**Code**: ${success.status}`);
    out.push(`**Format**: json`);
    if (success.type.kind === 'object') {
      out.push('**Data**:', '');
      out.push(fieldTable(success.type.fields));
      out.push('');
    } else if (success.type.kind === 'ref') {
      const target = spec.types[success.type.ref];
      if (target?.kind === 'object') {
        out.push('**Data**:', '');
        out.push(fieldTable(target.fields));
        out.push('');
      }
    }
    out.push('**Example**:', '', '```json', JSON.stringify(resolveExample(spec, success.type), null, 2), '```', '');
  }

  // Errors
  const errors = ep.responses.filter((r) => r.status >= 400);
  if (errors.length) {
    out.push('## Error Response', '');
    out.push('**Exceptions**:', '');
    for (const e of errors) out.push(`- ${e.status}`);
    out.push('');
    const first = errors[0]!;
    out.push('**Example**:', '', '```json', JSON.stringify(resolveExample(spec, first.type), null, 2), '```', '');
  }

  return out.join('\n');
}

function paramTableInline(params: readonly ParamLike[] | readonly ObjectField[]): string {
  const lines = [
    '| name | type | required | description |',
    '| --- | --- | --- | --- |',
  ];
  for (const p of params) {
    lines.push(`| ${p.name} | ${typeLabel(p.type)} | ${p.required ? 'yes' : 'no'} | ${p.description ?? ''} |`);
  }
  return lines.join('\n');
}

function fieldTable(fields: readonly ObjectField[]): string {
  const lines = [
    '| field | type | description |',
    '| --- | --- | --- |',
  ];
  for (const f of fields) {
    lines.push(`| ${f.name} | ${typeLabel(f.type)} | ${f.description ?? ''} |`);
  }
  return lines.join('\n');
}

function bodyForMarkdown(t: TypeDef, spec: Spec): string {
  if (t.kind === 'object') return fieldTable(t.fields);
  if (t.kind === 'ref') {
    const target = spec.types[t.ref];
    if (target?.kind === 'object') return fieldTable(target.fields);
    return `\`${typeLabel(t)}\``;
  }
  return '```json\n' + JSON.stringify(skeleton(t), null, 2) + '\n```';
}
```

(`paramTableInline` may end up being identical to the existing `paramTable` minus the heading line — refactor to share if cleaner. `fieldTable` is similar shape but with one fewer column.)

### Wiring in ExportPopover

In `apps/web/src/ui/ExportPopover.tsx` `buildTabs` `kind: 'endpoint'` branch — add a 6th tab between `client.ts` and `openapi.json`:

```tsx
import { endpointToMarkdown } from '../exporters/markdown';
// ...
{
  id: 'markdown',
  label: t('exportTabMarkdown'),
  output: endpointToMarkdown(ep, spec),
  filename: `${ep.id}.md`,
},
```

### i18n

`en.json`:
```json
"exportTabMarkdown": "Markdown"
```

`zh-TW.json`:
```json
"exportTabMarkdown": "Markdown"
```

(Same string in both locales — "Markdown" is a proper noun.)

### Tests

`apps/web/tests/exporters/markdown.endpoint.test.ts`:

```ts
test('endpointToMarkdown renders all sections for a typical endpoint', () => {
  const spec = emptySpec();
  spec.info.baseUrl = 'https://api.example.com';
  spec.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'name', required: true, type: { kind: 'string' }, description: 'Display name' },
    ],
  };
  const ep: Endpoint = {
    id: 'getUser',
    method: 'GET',
    path: '/users/{id}',
    description: 'Fetch a user by id\n\nLong description here.',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' }, description: 'User id' }],
    queryParams: undefined,
    headers: undefined,
    requestBody: null,
    responses: [
      { status: 200, type: { kind: 'ref', ref: 'User' } },
      { status: 404, type: { kind: 'object', fields: [{ name: 'error', required: true, type: { kind: 'string' } }] } },
    ],
    auth: 'inherit', useProxy: 'inherit',
  };

  const md = endpointToMarkdown(ep, spec);

  expect(md).toContain('# Fetch a user by id');
  expect(md).toContain('Long description here.');
  expect(md).toContain('## Info');
  expect(md).toContain('* URL: `https://api.example.com/users/{id}`');
  expect(md).toContain('* Method: `GET`');
  expect(md).toContain('## Parameters');
  expect(md).toContain('### Path params');
  expect(md).toContain('| id | string | yes | User id |');
  expect(md).toContain('## Success Response');
  expect(md).toContain('**Code**: 200');
  expect(md).toContain('| name | string |  | Display name |');
  expect(md).toContain('## Error Response');
  expect(md).toContain('- 404');
});

test('endpointToMarkdown omits Parameters section when there are no params', () => { /* ... */ });
test('endpointToMarkdown handles missing 2xx response', () => { /* ... */ });
test('endpointToMarkdown title falls back to METHOD path when description is empty', () => { /* ... */ });
```

`apps/web/tests/ui/ExportPopover.endpoint.test.tsx` — add an assertion that the new "Markdown" tab is present + clicking it shows the expected output.

### Risks

- **Title heuristic** — "first line of description, else METHOD path" — fine for typical endpoints. If description is multi-paragraph the title is the first paragraph's first line; should be readable. Document in code comment.
- **Body for non-object types** — request body could be array, primitive, or union. The current `bodyForMarkdown` handles object/ref-to-object via `fieldTable`; falls back to JSON skeleton for the rest. Good enough for v1.
- **Multiple 2xx responses** — picks the first. Most endpoints have one 2xx; if there's a real ambiguity (200 + 201) the Code line shows the first.
- **Error example always uses the FIRST error** — if 400 + 404 + 500 all have distinct error shapes, only the 400's example renders. Acceptable for a per-endpoint cheatsheet (the Exceptions list still shows all). Schema bump can add explicit example fields later.

## Done definition

- `endpointToMarkdown(ep, spec)` exported from `apps/web/src/exporters/markdown.ts`.
- ExportPopover endpoint scope has the new 6th tab.
- 4-5 unit tests + 1 ExportPopover assertion.
- i18n string in en + zh-TW.
- All tests + lint + build green.
- Spec + plan moved to `done/`.
- Branch `plan/per-endpoint-markdown` pushed.
