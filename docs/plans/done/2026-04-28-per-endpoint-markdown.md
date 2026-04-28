# Per-endpoint Markdown export tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 6th "Markdown" tab to the per-endpoint ExportPopover, producing a per-endpoint cheatsheet (Info / Parameters / Success Response / Error Response with tables + JSON examples).

**Architecture:** New `endpointToMarkdown(ep, spec): string` helper in `apps/web/src/exporters/markdown.ts` (alongside existing `toMarkdown`); wired into `ExportPopover.tsx`'s endpoint-scope `buildTabs`. New i18n key.

**Tech Stack:** TypeScript, vitest. No new deps. Uses existing `resolveExample` from `@zwaggen/core`.

---

### Spec

See `docs/specs/active/2026-04-28-per-endpoint-markdown.md`.

---

### Task 1: `endpointToMarkdown` helper + tests

**Files:**
- Modify: `apps/web/src/exporters/markdown.ts` — add `endpointToMarkdown` export + small helper functions.
- Create: `apps/web/tests/exporters/markdown.endpoint.test.ts` — 4 unit tests.

- [ ] **Step 1: Add `endpointToMarkdown` + small helpers**

Append to `apps/web/src/exporters/markdown.ts`:

```ts
import { resolveExample } from '@zwaggen/core';

/**
 * Per-endpoint Markdown cheatsheet — used by the per-endpoint export popover.
 * Shape: # title / ## Info / ## Parameters / ## Success Response / ## Error Response.
 * English headings (act as keywords). CSRF lines deferred to a future schema bump.
 */
export function endpointToMarkdown(ep: Endpoint, spec: Spec): string {
  const out: string[] = [];

  // Title: first line of description, else "METHOD path".
  const descLines = (ep.description ?? '').split('\n');
  const title = descLines[0]?.trim() || `${ep.method} ${ep.path}`;
  out.push(`# ${title}`, '');
  const restDesc = descLines.slice(1).join('\n').trim();
  if (restDesc) out.push(restDesc, '');

  // Info
  out.push('## Info', '');
  out.push(`* URL: \`${spec.info.baseUrl ?? ''}${ep.path}\``);
  out.push(`* Method: \`${ep.method}\``);
  out.push('');

  // Parameters
  const paramSections = [
    { title: 'Path params', list: ep.pathParams as readonly ParamLike[] },
    { title: 'Query params', list: resolveParamFields(ep.queryParams, spec) as readonly ObjectField[] },
    { title: 'Headers', list: resolveParamFields(ep.headers, spec) as readonly ObjectField[] },
  ].filter((s) => s.list.length > 0);
  if (paramSections.length || ep.requestBody) {
    out.push('## Parameters', '');
    for (const s of paramSections) {
      out.push(`### ${s.title}`, '');
      out.push(paramRows(s.list));
      out.push('');
    }
    if (ep.requestBody) {
      out.push('### Body', '');
      out.push(bodyMarkdown(ep.requestBody, spec));
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
    const objShape = resolveObjectFields(success.type, spec);
    if (objShape.length) {
      out.push('**Data**:', '');
      out.push(fieldRows(objShape));
      out.push('');
    }
    const example = resolveExample(spec, success.type);
    out.push('**Example**:', '');
    out.push('```json');
    out.push(JSON.stringify(example, null, 2));
    out.push('```', '');
  }

  // Errors
  const errors = ep.responses.filter((r) => r.status >= 400);
  if (errors.length) {
    out.push('## Error Response', '');
    out.push('**Exceptions**:', '');
    for (const e of errors) out.push(`- ${e.status}`);
    out.push('');
    out.push('**Example**:', '');
    out.push('```json');
    out.push(JSON.stringify(resolveExample(spec, errors[0]!.type), null, 2));
    out.push('```', '');
  }

  return out.join('\n');
}

function paramRows(params: readonly ParamLike[] | readonly ObjectField[]): string {
  const lines = ['| name | type | required | description |', '| --- | --- | --- | --- |'];
  for (const p of params) {
    lines.push(`| ${p.name} | ${typeLabel(p.type)} | ${p.required ? 'yes' : 'no'} | ${p.description ?? ''} |`);
  }
  return lines.join('\n');
}

function fieldRows(fields: readonly ObjectField[]): string {
  const lines = ['| field | type | description |', '| --- | --- | --- |'];
  for (const f of fields) {
    lines.push(`| ${f.name} | ${typeLabel(f.type)} | ${f.description ?? ''} |`);
  }
  return lines.join('\n');
}

function resolveObjectFields(t: TypeDef, spec: Spec): ObjectField[] {
  if (t.kind === 'object') return t.fields;
  if (t.kind === 'ref') {
    const target = spec.types[t.ref];
    if (target?.kind === 'object') return target.fields;
  }
  return [];
}

function bodyMarkdown(t: TypeDef, spec: Spec): string {
  const fields = resolveObjectFields(t, spec);
  if (fields.length) return fieldRows(fields);
  // Non-object body — show JSON skeleton.
  return '```json\n' + describe(t) + '\n```';
}
```

`describe` is already a function in this file; reuse. `ParamLike` and `typeLabel` are already defined locally. Add `import { resolveExample } from '@zwaggen/core';` at the top.

- [ ] **Step 2: Tests**

`apps/web/tests/exporters/markdown.endpoint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { endpointToMarkdown } from '../../src/exporters/markdown';
import { emptySpec, type Spec, type Endpoint, type RefType } from '@zwaggen/core';

function makeSpec(): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'name', required: true, type: { kind: 'string' }, description: 'Display name' },
    ],
  };
  return s;
}

const baseEp: Omit<Endpoint, 'id' | 'method' | 'path'> = {
  pathParams: [],
  requestBody: null,
  responses: [],
  auth: 'inherit',
  useProxy: 'inherit',
};

it('renders all sections for a typical endpoint', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'getUser',
    method: 'GET',
    path: '/users/{id}',
    description: 'Fetch a user by id\n\nLong description here.',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' }, description: 'User id' }],
    responses: [
      { status: 200, type: { kind: 'ref', ref: 'User' } as RefType },
      { status: 404, type: { kind: 'object', fields: [{ name: 'error', required: true, type: { kind: 'string' } }] } },
    ],
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
  expect(md).toContain('| name | string | Display name |');
  expect(md).toContain('## Error Response');
  expect(md).toContain('- 404');
  expect(md).toContain('**Format**: json');
  expect(md).toContain('```json');
});

it('omits Parameters section when there are no params', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'getStatus', method: 'GET', path: '/status',
    responses: [{ status: 200, type: { kind: 'object', fields: [{ name: 'ok', required: true, type: { kind: 'boolean' } }] } }],
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).not.toContain('## Parameters');
  expect(md).toContain('## Success Response');
});

it('renders _None defined_ when there is no 2xx response', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'broken', method: 'POST', path: '/broken',
    responses: [{ status: 500, type: { kind: 'object', fields: [] } }],
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toContain('## Success Response\n\n_None defined_');
  expect(md).toContain('## Error Response');
  expect(md).toContain('- 500');
});

it('falls back to METHOD path when description is empty', () => {
  const spec = makeSpec();
  const ep: Endpoint = { ...baseEp, id: 'foo', method: 'DELETE', path: '/foo/{id}' };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toMatch(/^# DELETE \/foo\/\{id\}/);
});

it('renders Body section as a table when requestBody is an object', () => {
  const spec = makeSpec();
  const ep: Endpoint = {
    ...baseEp,
    id: 'createUser', method: 'POST', path: '/users',
    requestBody: { kind: 'object', fields: [{ name: 'name', required: true, type: { kind: 'string' } }] },
    responses: [{ status: 201, type: { kind: 'ref', ref: 'User' } as RefType }],
  };
  const md = endpointToMarkdown(ep, spec);
  expect(md).toContain('### Body');
  expect(md).toContain('| name | string |  |');
});
```

- [ ] **Step 3: Verify**

```bash
cd /Users/victorliang/Zwaggen/.worktrees/per-endpoint-markdown
pnpm install   # if node_modules empty
pnpm --filter web test tests/exporters/markdown.endpoint.test.ts
pnpm --filter web test
pnpm --filter web lint
```

All green. Full suite count up by 5.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/exporters/markdown.ts apps/web/tests/exporters/markdown.endpoint.test.ts
git commit -m "$(cat <<'EOF'
feat(web): endpointToMarkdown — per-endpoint cheatsheet exporter

New helper alongside the existing full-spec toMarkdown. Renders
one endpoint as a Markdown cheatsheet with sections Info /
Parameters / Success Response / Error Response. Param tables and
field tables for response Data; resolveExample for the JSON
example blocks. CSRF fields deferred (would need a schema bump).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire Markdown tab into ExportPopover endpoint scope + i18n

**Files:**
- Modify: `apps/web/src/ui/ExportPopover.tsx` — add 6th tab in `kind: 'endpoint'` branch.
- Modify: `apps/web/src/i18n/locales/en.json` — add `exportTabMarkdown`.
- Modify: `apps/web/src/i18n/locales/zh-TW.json` — add `exportTabMarkdown`.
- Modify: `apps/web/tests/ui/ExportPopover.endpoint.test.tsx` — assert the new tab + sample output.

- [ ] **Step 1: i18n keys**

`en.json` (near the other `exportTab*` keys):
```json
"exportTabMarkdown": "Markdown"
```

`zh-TW.json`:
```json
"exportTabMarkdown": "Markdown"
```

(Same string in both — proper noun.)

- [ ] **Step 2: ExportPopover wiring**

In `apps/web/src/ui/ExportPopover.tsx`, find the `kind: 'endpoint'` branch in `buildTabs`. Add a 6th tab between `client.ts` and `openapi.json`:

```ts
import { endpointToMarkdown } from '../exporters/markdown';
// ...
{
  id: 'markdown',
  label: t('exportTabMarkdown'),
  output: endpointToMarkdown(ep, spec),
  filename: `${ep.id}.md`,
},
```

- [ ] **Step 3: Update endpoint test**

In `apps/web/tests/ui/ExportPopover.endpoint.test.tsx`:

- Update the "renders X tabs" test to include the new tab. Probably:
  ```ts
  it('endpoint scope renders cURL + types/schemas/client/markdown/openapi.json tabs', () => {
    // ... assert all 6 tabs present
  });
  ```
- Add 1 new test:
  ```ts
  it('Markdown tab renders the per-endpoint cheatsheet', async () => {
    render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^markdown$/i }));
    const text = preText();
    expect(text).toMatch(/## Info/);
    expect(text).toMatch(/## Success Response/);
  });
  ```

(Use `preText()` helper that already exists in this file.)

- [ ] **Step 4: Verify**

```bash
pnpm --filter web test tests/ui/ExportPopover.endpoint.test.tsx
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

All green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/ExportPopover.tsx apps/web/src/i18n/locales apps/web/tests/ui/ExportPopover.endpoint.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): ExportPopover endpoint scope gains Markdown tab

The per-endpoint export popover now offers 6 tabs: cURL /
types.ts / schemas.ts / client.ts / markdown / openapi.json.
The Markdown tab outputs a human-readable cheatsheet (Info /
Parameters / Success Response / Error Response) intended for
sharing one endpoint in chat or PR review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move spec/plan + final smoke

- [ ] **Step 1: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-28-per-endpoint-markdown.md docs/specs/done/
git mv docs/plans/active/2026-04-28-per-endpoint-markdown.md docs/plans/done/
```

- [ ] **Step 2: Final smoke**

```bash
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/cli build
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
```

All green.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: ship per-endpoint-markdown — move spec/plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- `endpointToMarkdown` exists in `apps/web/src/exporters/markdown.ts` + 5 unit tests pass.
- ExportPopover endpoint scope has the new Markdown tab in the right position.
- 1 new i18n key in both locales.
- 1 new ExportPopover test covers the Markdown tab.
- Full smoke green.
- Spec + plan moved to `done/`.
- Branch `plan/per-endpoint-markdown` ready to push.
