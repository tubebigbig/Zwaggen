import type { Spec, TypeDef } from '@zwaggen/core';

function flattenKey(key: string): string {
  return key.replace(/\//g, '_');
}

export function toJsonSchemaBundle(spec: Spec): any {
  const $defs: Record<string, any> = {};
  for (const [key, t] of Object.entries(spec.types)) $defs[flattenKey(key)] = buildSchemaFor(t);
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', $defs };
}

function buildSchemaFor(t: TypeDef): any {
  if (t.kind === 'object' && t.extends && t.extends.length > 0) {
    const allOf: any[] = t.extends.map((parent) => ({ $ref: `#/$defs/${flattenKey(parent)}` }));
    if (t.fields.length > 0 || t.strict) {
      const inline: any = { type: 'object' };
      if (t.fields.length > 0) {
        inline.properties = {};
        const req: string[] = [];
        for (const f of t.fields) {
          inline.properties[f.name] = toSchema(f.type);
          if (f.required) req.push(f.name);
        }
        if (req.length) inline.required = req;
      }
      if (t.strict) inline.additionalProperties = false;
      allOf.push(inline);
    }
    return { allOf };
  }
  return toSchema(t);
}

function toSchema(t: TypeDef): any {
  switch (t.kind) {
    case 'string': {
      const s: any = { type: 'string' };
      if (t.minLength != null) s.minLength = t.minLength;
      if (t.maxLength != null) s.maxLength = t.maxLength;
      if (t.pattern) s.pattern = t.pattern;
      if (t.enum) s.enum = t.enum;
      return s;
    }
    case 'number':
    case 'integer': {
      const s: any = { type: t.kind };
      if (t.min != null) s.minimum = t.min;
      if (t.max != null) s.maximum = t.max;
      if (t.enum) s.enum = t.enum;
      return s;
    }
    case 'boolean': return { type: 'boolean' };
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
    case 'ref': return { $ref: `#/$defs/${flattenKey(t.ref)}` };
  }
}
