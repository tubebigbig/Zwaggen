import {
  splitKey,
  groupByFolder,
  resolveParamFields,
  resolveExample,
  type Spec,
  type Endpoint,
  type TypeDef,
  type ParamDef,
  type ObjectField,
  type FolderNode,
} from '@zwaggen/core';

export function toMarkdown(spec: Spec): string {
  const out: string[] = [];
  out.push(`# ${spec.info.name}`);
  if (spec.info.description) out.push(spec.info.description);
  if (spec.info.baseUrl) out.push(`**Base URL:** \`${spec.info.baseUrl}\`\n`);

  // --- Types ---------------------------------------------------------------
  const typeKeys = Object.keys(spec.types);
  if (typeKeys.length) {
    out.push('\n## Types\n');
    const anyInFolder = typeKeys.some((k) => k.includes('/'));
    if (!anyInFolder) {
      for (const name of typeKeys) emitType(out, name, spec.types[name]!);
    } else {
      const typeItems = typeKeys.map((key) => { const s = splitKey(key); return { key, folder: s.folder, name: s.name }; });
      const tree = groupByFolder(typeItems, (i) => i.folder);
      emitTypeTree(out, spec, tree);
    }
  }

  // --- Endpoints -----------------------------------------------------------
  const endpointsHaveFolder = spec.endpoints.some((e) => !!e.folder);
  if (endpointsHaveFolder) {
    const tree = groupByFolder(spec.endpoints, (e) => e.folder);
    emitEndpointTree(out, tree, spec);
  } else {
    // Existing tag-group behavior: first tag becomes the group key; null groups are "Untagged".
    const groups = new Map<string | null, Endpoint[]>();
    for (const e of spec.endpoints) {
      const key = e.tags?.[0] ?? null;
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    const ordered: (string | null)[] = [
      ...[...groups.keys()].filter((k): k is string => k !== null).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      ...(groups.has(null) ? [null] : []),
    ];
    const flat = ordered.length === 1 && ordered[0] === null;
    if (flat) {
      for (const e of groups.get(null)!) emitEndpoint(out, e, 2, spec);
    } else {
      for (const key of ordered) {
        out.push(`\n## ${key ?? 'Untagged'}\n`);
        for (const e of groups.get(key)!) emitEndpoint(out, e, 3, spec);
      }
    }
  }

  return out.join('\n');
}

function slugifyHeading(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function emitType(out: string[], name: string, t: TypeDef): void {
  out.push(`### ${name}\n`);
  if (t.kind === 'object' && t.extends && t.extends.length > 0) {
    const links = t.extends.map((p) => `[${p}](#${slugifyHeading(p)})`).join(', ');
    out.push(`**Extends:** ${links}\n`);
  }
  out.push('```json');
  out.push(describe(t));
  out.push('```\n');
  const ex = (t.kind === 'object' || t.kind === 'array') ? t.example : undefined;
  if (ex !== undefined) {
    out.push('#### Example\n');
    out.push('```json');
    out.push(JSON.stringify(ex, null, 2));
    out.push('```\n');
  }
}

function emitTypeTree(
  out: string[],
  spec: Spec,
  node: FolderNode<{ key: string; name: string; folder: string | undefined }>,
): void {
  // Root items first (no "Folder:" heading for the virtual root).
  for (const item of node.items) emitType(out, item.name, spec.types[item.key]!);
  for (const child of node.children) {
    out.push(`\n### Folder: ${child.path}\n`);
    for (const item of child.items) emitType(out, item.name, spec.types[item.key]!);
    // Recurse into deeper folders, each emits its own "Folder:" heading.
    walkTypeTree(out, spec, child);
  }
}

function walkTypeTree(
  out: string[],
  spec: Spec,
  node: FolderNode<{ key: string; name: string; folder: string | undefined }>,
): void {
  for (const child of node.children) {
    out.push(`\n### Folder: ${child.path}\n`);
    for (const item of child.items) emitType(out, item.name, spec.types[item.key]!);
    walkTypeTree(out, spec, child);
  }
}

function emitEndpointTree(out: string[], node: FolderNode<Endpoint>, spec: Spec): void {
  // Root-level endpoints use H2 (same depth as pre-change flat mode).
  for (const e of node.items) emitEndpoint(out, e, 2, spec);
  // Each folder becomes an H2 heading; deeper subfolders use H3, etc.
  const walk = (n: FolderNode<Endpoint>, depth: number): void => {
    for (const child of n.children) {
      out.push(`\n${'#'.repeat(depth)} ${child.path}\n`);
      for (const e of child.items) emitEndpoint(out, e, depth + 1, spec);
      walk(child, depth + 1);
    }
  };
  walk(node, 2);
}

function emitEndpoint(out: string[], e: Endpoint, depth: number, spec: Spec): void {
  const h = (n: number) => '#'.repeat(n);
  out.push(`\n${h(depth)} ${e.method} ${e.path}\n`);
  if (e.description) out.push(`${e.description}\n`);
  if (e.pathParams.length) out.push(paramTable('Path params', e.pathParams, depth + 1));
  const queryFields = resolveParamFields(e.queryParams, spec);
  if (queryFields.length) out.push(paramTable('Query params', queryFields, depth + 1));
  const headerFields = resolveParamFields(e.headers, spec);
  if (headerFields.length) out.push(paramTable('Headers', headerFields, depth + 1));
  if (e.requestBody) {
    out.push(`${h(depth + 1)} Request body\n\`\`\`json`);
    out.push(describe(e.requestBody));
    out.push('```');
  }
  out.push(`${h(depth + 1)} Responses\n`);
  for (const r of e.responses) {
    const typeNote = r.type.kind === 'ref' ? ` ${typeLabel(r.type)}` : '';
    out.push(`${h(depth + 2)} ${r.status}${typeNote}\n`);
    out.push('```json');
    out.push(describe(r.type));
    out.push('```\n');
  }
}

// ParamDef and ObjectField share the same { name; required; type; description? }
// shape, so the table renderer accepts either.
type ParamLike = Pick<ParamDef, 'name' | 'required' | 'type'> & { description?: string };

function paramTable(title: string, params: readonly ParamLike[] | readonly ObjectField[], headingDepth: number): string {
  const h = '#'.repeat(headingDepth);
  return `${h} ${title}\n\n${paramRows(params)}\n`;
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
  const queryFields = resolveParamFields(ep.queryParams, spec);
  const headerFields = resolveParamFields(ep.headers, spec);
  const paramSections: { title: string; list: readonly ParamLike[] | readonly ObjectField[] }[] = [
    { title: 'Path params', list: ep.pathParams },
    { title: 'Query params', list: queryFields },
    { title: 'Headers', list: headerFields },
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

function typeLabel(t: TypeDef): string {
  switch (t.kind) {
    case 'array': return `${typeLabel(t.element)}[]`;
    case 'ref': return `[${t.ref}](#${slugifyHeading(t.ref)})`;
    case 'literal': return `literal(${JSON.stringify(t.value)})`;
    case 'union': return t.variants.map(typeLabel).join(' | ');
    default: return t.kind;
  }
}

function describe(t: TypeDef): string { return JSON.stringify(skeleton(t), null, 2); }

function skeleton(t: TypeDef): unknown {
  switch (t.kind) {
    case 'string': return 'string';
    case 'number':
    case 'integer': return 0;
    case 'boolean': return false;
    case 'null': return null;
    case 'literal': return t.value;
    case 'array': return [skeleton(t.element)];
    case 'object': return Object.fromEntries(t.fields.map((f) => [f.required ? f.name : `${f.name}?`, skeleton(f.type)]));
    case 'union': return t.variants.map(skeleton);
    case 'ref': return `[${t.ref}](#${slugifyHeading(t.ref)})`;
  }
}
