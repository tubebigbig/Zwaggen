import {
  splitKey,
  groupByFolder,
  type Spec,
  type Endpoint,
  type TypeDef,
  type ParamDef,
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
    emitEndpointTree(out, tree);
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
      for (const e of groups.get(null)!) emitEndpoint(out, e, 2);
    } else {
      for (const key of ordered) {
        out.push(`\n## ${key ?? 'Untagged'}\n`);
        for (const e of groups.get(key)!) emitEndpoint(out, e, 3);
      }
    }
  }

  return out.join('\n');
}

function emitType(out: string[], name: string, t: TypeDef): void {
  out.push(`### ${name}\n`);
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

function emitEndpointTree(out: string[], node: FolderNode<Endpoint>): void {
  // Root-level endpoints use H2 (same depth as pre-change flat mode).
  for (const e of node.items) emitEndpoint(out, e, 2);
  // Each folder becomes an H2 heading; deeper subfolders use H3, etc.
  const walk = (n: FolderNode<Endpoint>, depth: number): void => {
    for (const child of n.children) {
      out.push(`\n${'#'.repeat(depth)} ${child.path}\n`);
      for (const e of child.items) emitEndpoint(out, e, depth + 1);
      walk(child, depth + 1);
    }
  };
  walk(node, 2);
}

function emitEndpoint(out: string[], e: Endpoint, depth: number): void {
  const h = (n: number) => '#'.repeat(n);
  out.push(`\n${h(depth)} ${e.method} ${e.path}\n`);
  if (e.description) out.push(`${e.description}\n`);
  if (e.pathParams.length) out.push(paramTable('Path params', e.pathParams, depth + 1));
  if (e.queryParams.length) out.push(paramTable('Query params', e.queryParams, depth + 1));
  if (e.headers.length) out.push(paramTable('Headers', e.headers, depth + 1));
  if (e.requestBody) {
    out.push(`${h(depth + 1)} Request body\n\`\`\`json`);
    out.push(describe(e.requestBody));
    out.push('```');
  }
  out.push(`${h(depth + 1)} Responses\n`);
  for (const r of e.responses) {
    out.push(`${h(depth + 2)} ${r.status}\n`);
    out.push('```json');
    out.push(describe(r.type));
    out.push('```\n');
  }
}

function paramTable(title: string, params: ParamDef[], headingDepth: number): string {
  const h = '#'.repeat(headingDepth);
  const lines = [`${h} ${title}\n`, '| name | type | required | description |', '| --- | --- | --- | --- |'];
  for (const p of params) {
    lines.push(`| ${p.name} | ${typeLabel(p.type)} | ${p.required ? 'yes' : 'no'} | ${p.description ?? ''} |`);
  }
  return lines.join('\n') + '\n';
}

function typeLabel(t: TypeDef): string {
  switch (t.kind) {
    case 'array': return `${typeLabel(t.element)}[]`;
    case 'ref': return t.ref;
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
    case 'ref': return `#${t.ref}`;
  }
}
