import type { Spec, Endpoint, TypeDef, ParamDef } from '../schema/types';

export function toMarkdown(spec: Spec): string {
  const out: string[] = [];
  out.push(`# ${spec.info.name}`);
  if (spec.info.description) out.push(spec.info.description);
  if (spec.info.baseUrl) out.push(`**Base URL:** \`${spec.info.baseUrl}\`\n`);
  if (Object.keys(spec.types).length) {
    out.push('\n## Types\n');
    for (const [name, t] of Object.entries(spec.types)) {
      out.push(`### ${name}\n`);
      out.push('```json');
      out.push(describe(t));
      out.push('```\n');
    }
  }

  const primaryTag = (e: Endpoint) => e.tags?.[0] ?? null;
  const groups = new Map<string | null, Endpoint[]>();
  for (const e of spec.endpoints) {
    const key = primaryTag(e);
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const ordered: (string | null)[] = [
    ...[...groups.keys()]
      .filter((k): k is string => k !== null)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    ...(groups.has(null) ? [null as const] : []),
  ];

  const flat = ordered.length === 1 && ordered[0] === null;

  if (flat) {
    // Backward-compat: all endpoints untagged — emit at original depth (H2)
    for (const e of groups.get(null)!) {
      emitEndpoint(out, e, 2);
    }
  } else {
    for (const key of ordered) {
      out.push(`\n## ${key ?? 'Untagged'}\n`);
      for (const e of groups.get(key)!) {
        emitEndpoint(out, e, 3);
      }
    }
  }

  return out.join('\n');
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

function describe(t: TypeDef): string {
  return JSON.stringify(skeleton(t), null, 2);
}

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
