import type { Spec, TypeDef } from '../schema/types';

export function toOpenApi(spec: Spec): any {
  const schemas: Record<string, any> = {};
  for (const [name, t] of Object.entries(spec.types)) schemas[name] = toSchema(t);

  const paths: Record<string, any> = {};
  for (const e of spec.endpoints) {
    const p = (paths[e.path] ??= {});
    p[e.method.toLowerCase()] = {
      summary: e.description,
      parameters: [
        ...e.pathParams.map((x) => param(x, 'path')),
        ...e.queryParams.map((x) => param(x, 'query')),
        ...e.headers.map((x) => param(x, 'header')),
      ],
      ...(e.requestBody ? {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: toSchema(e.requestBody) } },
        },
      } : {}),
      responses: Object.fromEntries(e.responses.map((r) => [
        String(r.status),
        { description: '', content: { 'application/json': { schema: toSchema(r.type) } } },
      ])),
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: spec.info.name, version: spec.info.version ?? '0.1.0', description: spec.info.description },
    paths,
    components: { schemas },
  };
}

function param(p: { name: string; required: boolean; type: TypeDef; description?: string }, where: 'path' | 'query' | 'header') {
  return { name: p.name, in: where, required: p.required, description: p.description, schema: toSchema(p.type) };
}

function toSchema(t: TypeDef): any {
  switch (t.kind) {
    case 'string': {
      const s: any = { type: 'string' };
      if (t.minLength != null) s.minLength = t.minLength;
      if (t.maxLength != null) s.maxLength = t.maxLength;
      if (t.pattern) s.pattern = t.pattern;
      if (t.enum) s.enum = t.enum;
      if (t.description) s.description = t.description;
      return s;
    }
    case 'number':
    case 'integer': {
      const s: any = { type: t.kind };
      if (t.min != null) s.minimum = t.min;
      if (t.max != null) s.maximum = t.max;
      if (t.enum) s.enum = t.enum;
      if (t.description) s.description = t.description;
      return s;
    }
    case 'boolean': return { type: 'boolean', ...(t.description ? { description: t.description } : {}) };
    case 'null': return { type: 'null' };
    case 'literal': return { const: t.value };
    case 'array': {
      const s: any = { type: 'array', items: toSchema(t.element) };
      if (t.minItems != null) s.minItems = t.minItems;
      if (t.maxItems != null) s.maxItems = t.maxItems;
      return s;
    }
    case 'object': {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const f of t.fields) {
        properties[f.name] = toSchema(f.type);
        if (f.required) required.push(f.name);
      }
      const s: any = { type: 'object', properties };
      if (required.length) s.required = required;
      if (t.strict) s.additionalProperties = false;
      return s;
    }
    case 'union': return { oneOf: t.variants.map(toSchema) };
    case 'ref': return { $ref: `#/components/schemas/${t.ref}` };
  }
}
