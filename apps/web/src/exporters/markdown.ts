import {
  splitKey,
  groupByFolder,
  resolveParamFields,
  resolveSlice,
  collectRefsFromEndpoint,
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

function paramRows(params: readonly ParamLike[] | readonly ObjectField[], spec?: Spec): string {
  const lines = ['| name | type | required | description |', '| --- | --- | --- | --- |'];
  for (const p of params) {
    const desc = spec ? resolveFieldDescription(p, spec) : (p.description ?? '');
    lines.push(`| ${p.name} | ${typeLabel(p.type)} | ${p.required ? 'yes' : 'no'} | ${desc} |`);
  }
  return lines.join('\n');
}

function fieldRows(fields: readonly ObjectField[], spec?: Spec): string {
  const lines = ['| field | type | description |', '| --- | --- | --- |'];
  for (const f of fields) {
    const desc = spec ? resolveFieldDescription(f, spec) : (f.description ?? '');
    lines.push(`| ${f.name} | ${typeLabel(f.type)} | ${desc} |`);
  }
  return lines.join('\n');
}

/**
 * Description resolution for a field/param: own description wins; otherwise
 * walks the type chain (ref → target type → its description, recursively
 * through nested refs) until a description is found. Returns '' if none.
 *
 * Lets a field inherit a description from the type it references, so the
 * field table doesn't go blank when the schema author put descriptions on
 * the type definition rather than on every individual usage site. Local
 * field-level descriptions still override.
 */
function resolveFieldDescription(field: ParamLike | ObjectField, spec: Spec): string {
  if (field.description) return field.description;
  return resolveTypeDescription(field.type, spec, new Set());
}

function resolveTypeDescription(t: TypeDef, spec: Spec, visited: Set<string>): string {
  if ('description' in t && t.description) return t.description;
  if (t.kind === 'ref') {
    if (visited.has(t.ref)) return '';
    visited.add(t.ref);
    const target = spec.types[t.ref];
    if (target) return resolveTypeDescription(target, spec, visited);
  }
  return '';
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
  if (fields.length) return fieldRows(fields, spec);
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
  out.push('_Optional fields are marked `?` in the JSON examples and may be undefined._', '');

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
      out.push(paramRows(s.list, spec));
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
      out.push(fieldRows(objShape, spec));
      out.push('');
    }
    const successExample = endpointExample(success.type, spec);
    if (successExample !== undefined) {
      out.push('**Example**:', '');
      out.push('```json');
      out.push(JSON.stringify(successExample, null, 2));
      out.push('```', '');
    }
  }

  // Errors
  const errors = ep.responses.filter((r) => r.status >= 400);
  if (errors.length) {
    out.push('## Error Response', '');
    out.push('**Exceptions**:', '');
    for (const e of errors) out.push(`- ${e.status}`);
    out.push('');
    const errorExample = endpointExample(errors[0]!.type, spec);
    if (errorExample !== undefined) {
      out.push('**Example**:', '');
      out.push('```json');
      out.push(JSON.stringify(errorExample, null, 2));
      out.push('```', '');
    }
  }

  // Types — inline the transitive type closure so refs resolve in-file.
  // Walk the endpoint's direct refs first (works even if ep isn't in
  // spec.endpoints — e.g. if the popover passes a transient endpoint),
  // then expand via resolveSlice so deep refs (TypeA → TypeB) come along.
  // Markdown files are generated; if the same type appears in multiple
  // endpoint files it's intentionally duplicated.
  const directRefs = new Set<string>();
  collectRefsFromEndpoint(ep, directRefs);
  const slice = resolveSlice(spec, { typeKeys: Array.from(directRefs) });
  if (slice.types.length) {
    out.push('## Types', '');
    for (let i = 0; i < slice.types.length; i++) {
      const key = slice.typeKeys[i]!;
      const def = slice.types[i]!;
      out.push(`### ${key}`, '');
      // Type-level description, if any (separate from field-level).
      if ('description' in def && def.description) out.push(def.description, '');
      const objFields = resolveObjectFields(def, spec);
      if (objFields.length) {
        out.push(fieldRows(objFields, spec));
      } else {
        out.push('```json', describe(def), '```');
      }
      out.push('');
    }
  }

  return out.join('\n');
}

/**
 * Resolves the example JSON for a response type with EXACTLY one fallback step:
 *
 *   1. The type's own `example` field (set on inline ObjectType / ArrayType).
 *   2. If the type is a one-level ref, the target type's `example` field.
 *
 * Returns `undefined` when neither is set — the caller skips the **Example**:
 * block entirely. Deliberately does NOT call resolveExample's recursive
 * synthesis: showing a `<ref:Name>` placeholder for a refless type was more
 * confusing than no example at all.
 */
function endpointExample(t: TypeDef, spec: Spec): unknown | undefined {
  if ('example' in t && t.example !== undefined) return t.example;
  if (t.kind === 'ref') {
    const target = spec.types[t.ref];
    if (target && 'example' in target && target.example !== undefined) return target.example;
  }
  return undefined;
}

/**
 * Sanitizes an endpoint path into a filesystem-safe basename.
 * `/users/{id}` → `users_id`; `/` (root) → `index`. Combined with the method
 * prefix in `endpointMarkdownFilename`, the result is unique even when several
 * endpoints share a path (POST + DELETE on the same resource).
 */
export function endpointMarkdownFilename(ep: Endpoint): string {
  const sanitized = ep.path
    .replace(/^\/+/, '')      // drop leading slashes
    .replace(/\/+$/, '')      // drop trailing slashes
    .replace(/\//g, '_')      // path separators → underscores
    .replace(/[{}]/g, '');    // strip path-param braces
  const base = sanitized || 'index';
  return `${ep.method}_${base}.md`;
}

function typeLabel(t: TypeDef): string {
  switch (t.kind) {
    case 'array': {
      const inner = typeLabel(t.element);
      // If the inner renders as a union (contains an escaped pipe) wrap in
      // parens so `[]` doesn't visually attach to only the last variant.
      // Example: `(A \| B)[]` reads as "array of A-or-B"; without parens it
      // would be `A \| B[]` which looks like "A or array-of-B".
      return inner.includes(' \\| ') ? `(${inner})[]` : `${inner}[]`;
    }
    case 'ref': return `[${t.ref}](#${slugifyHeading(t.ref)})`;
    case 'literal': return `literal(${JSON.stringify(t.value)})`;
    // Pipe is escaped so a union label can land in a markdown table cell
    // without breaking the column structure. `\|` renders as a normal pipe
    // outside tables too (CommonMark spec).
    case 'union': return t.variants.map(typeLabel).join(' \\| ');
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
    // refs are emitted as `<ref:Name>` rather than `[Name](#Name)` because
    // markdown links don't render inside fenced code blocks where these
    // skeletons land. Cmd-F on the bare name finds the matching `### Name`
    // heading in the inlined ## Types section below.
    case 'ref': return `<ref:${t.ref}>`;
  }
}
