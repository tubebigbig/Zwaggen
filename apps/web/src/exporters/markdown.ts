import type { Spec, TypeDef, ParamDef } from '../schema/types';

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
  for (const e of spec.endpoints) {
    out.push(`\n## ${e.method} ${e.path}\n`);
    if (e.description) out.push(`${e.description}\n`);
    if (e.pathParams.length) out.push(paramTable('Path params', e.pathParams));
    if (e.queryParams.length) out.push(paramTable('Query params', e.queryParams));
    if (e.headers.length) out.push(paramTable('Headers', e.headers));
    if (e.requestBody) {
      out.push('### Request body\n```json');
      out.push(describe(e.requestBody));
      out.push('```');
    }
    out.push('### Responses\n');
    for (const r of e.responses) {
      out.push(`#### ${r.status}\n`);
      out.push('```json');
      out.push(describe(r.type));
      out.push('```\n');
    }
  }
  return out.join('\n');
}

function paramTable(title: string, params: ParamDef[]): string {
  const lines = [`### ${title}\n`, '| name | type | required | description |', '| --- | --- | --- | --- |'];
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
