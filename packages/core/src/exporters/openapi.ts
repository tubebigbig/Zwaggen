import { splitKey } from '../schema/folders';
import { resolveParamFields } from '../runner/resolveParamFields';
import type { Spec, TypeDef, ParamDef } from '../schema/types';
import { findIllegalFileTypes } from '../schema/validateFileType';
import { resolveSlice, type CodegenSlice } from '../codegen/closure';

function flattenKey(key: string): string {
  return key.replace(/\//g, '_');
}

export function toOpenApi(spec: Spec, opts?: { only?: CodegenSlice }): any {
  // Defensive guard: file types are only legal as top-level fields of a
  // multipart bodyForm. Surface placement errors here so the OpenAPI we
  // export never carries a `format: binary` field outside of a
  // `multipart/form-data` schema.
  const fileErrs = findIllegalFileTypes(spec);
  if (fileErrs.length > 0) {
    throw new Error(
      'OpenAPI export aborted — illegal file type placements:\n' +
        fileErrs.map((e) => `  • ${e.where}: ${e.message}`).join('\n'),
    );
  }
  const slice = resolveSlice(spec, opts?.only);
  const schemas: Record<string, any> = {};
  for (let i = 0; i < slice.types.length; i++) {
    const key = slice.typeKeys[i]!;
    const t = slice.types[i]!;
    const flat = flattenKey(key);
    const schema = buildSchemaFor(t, key);
    const { folder } = splitKey(key);
    if (folder) schema['x-folder'] = folder;
    schemas[flat] = schema;
  }

  const paths: Record<string, any> = {};
  for (const e of slice.endpoints) {
    const p = (paths[e.path] ??= {});
    // v7 query/headers are an ObjectType (or RefType); resolveParamFields
    // returns the resolved fields list. Each field becomes one OpenAPI
    // parameter entry, matching the runtime form/explode serialization
    // (OpenAPI 3 default for query; explicit for header since
    // simple/explode=false is the default). Empty/undefined slots resolve
    // to [] and emit nothing.
    const expandedQuery = resolveParamFields(e.queryParams, spec);
    const expandedHeaders = resolveParamFields(e.headers, spec);
    const op: any = {
      summary: e.description,
      parameters: [
        ...e.pathParams.map((x) => param(x, 'path')),
        ...expandedQuery.map((x) => param(x, 'query')),
        ...expandedHeaders.map((x) => param(x, 'header')),
      ],
      ...buildRequestBody(e),
      responses: Object.fromEntries(e.responses.map((r) => [
        String(r.status),
        { description: '', content: { 'application/json': { schema: toSchema(r.type) } } },
      ])),
    };
    if (e.tags && e.tags.length) op.tags = [...e.tags];
    if (e.folder) op['x-folder'] = e.folder;
    if (e.extensions) {
      for (const [k, v] of Object.entries(e.extensions)) {
        if (k in op) continue; // defensive: don't let extensions clobber Zwaggen-written keys (x-folder, etc.)
        op[k] = v;
      }
    }
    p[e.method.toLowerCase()] = op;
  }

  const doc: any = {
    openapi: '3.1.0',
    info: { title: spec.info.name, version: spec.info.version ?? '0.1.0', description: spec.info.description },
    paths,
    components: { schemas },
  };
  if (spec.info.baseUrl) doc.servers = [{ url: spec.info.baseUrl }];
  const used = new Set<string>();
  for (const e of slice.endpoints) for (const t of e.tags ?? []) used.add(t);
  if (used.size) doc.tags = [...used].sort().map((name) => ({ name }));
  return doc;
}

function param(p: { name: string; required: boolean; type: TypeDef; description?: string }, where: 'path' | 'query' | 'header') {
  const out: any = { name: p.name, in: where, required: p.required, description: p.description, schema: toSchema(p.type) };
  // Header default is `style=simple, explode=false`. For parity with the
  // expanded form/explode semantics we apply at runtime, set explode=true
  // explicitly so importers (and humans reading the spec) see the
  // intended serialization. Query default is already form/explode=true.
  if (where === 'header') out.explode = true;
  return out;
}

function paramDefArrayToSchema(fields: ParamDef[]): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const f of fields) {
    properties[f.name] = toSchema(f.type);
    if (f.required) required.push(f.name);
  }
  const s: any = { type: 'object', properties };
  if (required.length) s.required = required;
  return s;
}

function buildRequestBody(e: { bodyContentType?: 'json' | 'urlencoded' | 'multipart'; bodyForm?: ParamDef[]; requestBody: TypeDef | null }): { requestBody?: any } {
  const ct = e.bodyContentType ?? 'json';
  if (ct === 'urlencoded' && e.bodyForm && e.bodyForm.length > 0) {
    return { requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: paramDefArrayToSchema(e.bodyForm) } } } };
  }
  if (ct === 'multipart' && e.bodyForm && e.bodyForm.length > 0) {
    return { requestBody: { required: true, content: { 'multipart/form-data': { schema: paramDefArrayToSchema(e.bodyForm) } } } };
  }
  if (ct === 'json' && e.requestBody) {
    return { requestBody: { required: true, content: { 'application/json': { schema: toSchema(e.requestBody) } } } };
  }
  return {};
}

function buildSchemaFor(t: TypeDef, _key: string): any {
  if (t.kind === 'object' && t.extends && t.extends.length > 0) {
    const allOf: any[] = t.extends.map((parent) => ({ $ref: `#/components/schemas/${flattenKey(parent)}` }));
    if (t.fields.length > 0 || t.strict || t.description) {
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
      if (t.description) inline.description = t.description;
      allOf.push(inline);
    }
    const schema: any = { allOf };
    if (t.description) schema.description = t.description;
    return schema;
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
      if (t.example !== undefined) s.example = t.example;
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
      if (t.example !== undefined) s.example = t.example;
      return s;
    }
    case 'union': return { oneOf: t.variants.map(toSchema) };
    case 'ref': return { $ref: `#/components/schemas/${flattenKey(t.ref)}` };
    case 'file': {
      // OpenAPI 3.x: binary upload fields are encoded as
      // `{ type: 'string', format: 'binary' }`. The validator above ensures
      // we only emit this inside a multipart/form-data schema's properties.
      const s: any = { type: 'string', format: 'binary' };
      if (t.description) s.description = t.description;
      if (t.accept) s['x-zwaggen-accept'] = t.accept;
      if (t.maxBytes != null) s['x-zwaggen-max-bytes'] = t.maxBytes;
      return s;
    }
  }
}
