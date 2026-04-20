import {
  CURRENT_SCHEMA_VERSION,
  type Spec,
  type TypeDef,
  type ObjectField,
  type StringType,
  type NumberType,
  type IntegerType,
  type BooleanType,
  type ArrayType,
  type ObjectType,
  type UnionType,
  type ParamDef,
  type ResponseDef,
  type Endpoint,
} from '@zwaggen/core';

export interface ImportResult {
  spec: Spec;
  warnings: string[];
}

export function fromOpenApi(doc: unknown): ImportResult {
  const warnings: string[] = [];

  if (typeof doc !== 'object' || doc === null) {
    warnings.push('Document is not an object — imported empty spec.');
    return { spec: emptySpec(), warnings };
  }
  const d = doc as Record<string, unknown>;

  const info = (d.info ?? {}) as Record<string, unknown>;
  const servers = Array.isArray(d.servers)
    ? (d.servers as Array<Record<string, unknown>>)
    : [];
  const baseUrl =
    typeof servers[0]?.url === 'string' ? (servers[0].url as string) : undefined;

  const spec: Spec = {
    ...emptySpec(),
    info: {
      name: typeof info.title === 'string' ? info.title : 'imported',
      version: typeof info.version === 'string' ? info.version : undefined,
      description:
        typeof info.description === 'string' ? info.description : undefined,
      baseUrl,
    },
  };

  const schemas = (
    ((d.components as Record<string, unknown> | undefined)?.schemas) ?? {}
  ) as Record<string, unknown>;

  // Pass 1: build flat-key → internal-key map from x-folder.
  const keyMap: Record<string, string> = {};
  for (const [flat, raw] of Object.entries(schemas)) {
    let internal = flat;
    if (raw && typeof raw === 'object') {
      const xf = (raw as Record<string, unknown>)['x-folder'];
      if (typeof xf === 'string' && xf.length > 0) internal = `${xf}/${shortNameFor(flat, xf)}`;
    }
    keyMap[flat] = internal;
  }

  // Pass 2: parse schemas, storing under internal keys and rewriting refs.
  for (const [flat, raw] of Object.entries(schemas)) {
    const t = readSchema(raw, warnings, `components.schemas.${flat}`, keyMap);
    if (t) spec.types[keyMap[flat]!] = t;
  }

  const paths = (d.paths ?? {}) as Record<string, unknown>;
  const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

  for (const [path, methodMap] of Object.entries(paths)) {
    if (typeof methodMap !== 'object' || methodMap === null) continue;
    const pathItem = methodMap as Record<string, unknown>;

    // Path-level parameters (rarely used but valid) merge into each operation.
    const pathLevelParams = Array.isArray(pathItem.parameters)
      ? (pathItem.parameters as unknown[])
      : [];

    for (const m of METHODS) {
      const op = pathItem[m];
      if (typeof op !== 'object' || op === null) continue;
      const operation = op as Record<string, unknown>;

      const endpoint = readOperation(path, m, operation, pathLevelParams, warnings, keyMap);
      if (endpoint) spec.endpoints.push(endpoint);
    }
  }

  return { spec, warnings };
}

function emptySpec(): Spec {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    info: { name: 'imported' },
    types: {},
    environments: { default: { variables: [] } },
    activeEnvironment: 'default',
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [],
  };
}

function readSchema(
  raw: unknown,
  warnings: string[],
  path: string,
  keyMap?: Record<string, string>,
): TypeDef | undefined {
  if (typeof raw !== 'object' || raw === null) {
    warnings.push(`${path}: expected object schema`);
    return undefined;
  }
  const s = raw as Record<string, unknown>;

  // $ref — local #/components/schemas/ only (takes precedence over everything)
  if (typeof s.$ref === 'string') {
    const localPrefix = '#/components/schemas/';
    if (s.$ref.startsWith(localPrefix)) {
      const flat = s.$ref.slice(localPrefix.length);
      const internal = keyMap?.[flat] ?? flat;
      return { kind: 'ref', ref: internal };
    }
    warnings.push(
      `${path}: external or non-components $ref "${s.$ref}" not supported`,
    );
    return undefined;
  }

  // const
  if ('const' in s) {
    const v = s.const;
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      v === null
    ) {
      return { kind: 'literal', value: v };
    }
    warnings.push(`${path}: const value type not supported`);
    return undefined;
  }

  // oneOf / anyOf / allOf — handled before single-type dispatch
  if (Array.isArray(s.oneOf)) {
    return readUnion(s.oneOf, warnings, path, 'oneOf', keyMap);
  }
  if (Array.isArray(s.anyOf)) {
    warnings.push(`${path}: anyOf treated as union`);
    return readUnion(s.anyOf, warnings, path, 'anyOf', keyMap);
  }
  if (Array.isArray(s.allOf)) {
    return readAllOf(s.allOf, warnings, path, keyMap);
  }

  // Multi-type array (OpenAPI 3.1): type: ['string', 'null']
  if (Array.isArray(s.type)) {
    const variants = (s.type as unknown[])
      .map((kind, i) =>
        readSchema(
          { ...s, type: kind, oneOf: undefined, anyOf: undefined, allOf: undefined },
          warnings,
          `${path}.type[${i}]`,
          keyMap,
        ),
      )
      .filter((v): v is TypeDef => v !== undefined);
    if (variants.length === 0) {
      warnings.push(`${path}: type array resolved to nothing`);
      return undefined;
    }
    if (variants.length === 1) return variants[0];
    return { kind: 'union', variants };
  }

  // Single-type dispatch — result captured in `main` so nullable wrapping can be applied
  let main: TypeDef | undefined;

  const type = s.type;

  if (type === 'string') {
    const t: StringType = { kind: 'string' };
    if (typeof s.minLength === 'number') t.minLength = s.minLength;
    if (typeof s.maxLength === 'number') t.maxLength = s.maxLength;
    if (typeof s.pattern === 'string') t.pattern = s.pattern;
    if (
      Array.isArray(s.enum) &&
      s.enum.every((v) => typeof v === 'string')
    ) {
      t.enum = s.enum as string[];
    }
    if (typeof s.description === 'string') t.description = s.description;
    main = t;
  } else if (type === 'number') {
    const t: NumberType = { kind: 'number' };
    if (typeof s.minimum === 'number') t.min = s.minimum;
    if (typeof s.maximum === 'number') t.max = s.maximum;
    if (
      Array.isArray(s.enum) &&
      s.enum.every((v) => typeof v === 'number')
    ) {
      t.enum = s.enum as number[];
    }
    if (typeof s.description === 'string') t.description = s.description;
    main = t;
  } else if (type === 'integer') {
    const t: IntegerType = { kind: 'integer' };
    if (typeof s.minimum === 'number') t.min = s.minimum;
    if (typeof s.maximum === 'number') t.max = s.maximum;
    if (
      Array.isArray(s.enum) &&
      s.enum.every((v) => typeof v === 'number')
    ) {
      t.enum = s.enum as number[];
    }
    if (typeof s.description === 'string') t.description = s.description;
    main = t;
  } else if (type === 'boolean') {
    const t: BooleanType = { kind: 'boolean' };
    if (typeof s.description === 'string') t.description = s.description;
    main = t;
  } else if (type === 'null') {
    main = { kind: 'null' };
  } else if (type === 'array') {
    const element =
      s.items !== undefined
        ? readSchema(s.items, warnings, `${path}.items`, keyMap)
        : undefined;
    if (!element) {
      warnings.push(`${path}: array missing items`);
      return undefined;
    }
    const t: ArrayType = { kind: 'array', element };
    if (typeof s.minItems === 'number') t.minItems = s.minItems;
    if (typeof s.maxItems === 'number') t.maxItems = s.maxItems;
    if (typeof s.description === 'string') t.description = s.description;
    main = t;
  } else if (type === 'object') {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const required = Array.isArray(s.required)
      ? (s.required as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : [];
    const fields: ObjectField[] = [];
    for (const [fname, fraw] of Object.entries(props)) {
      const ft = readSchema(fraw, warnings, `${path}.properties.${fname}`, keyMap);
      if (!ft) continue;
      fields.push({ name: fname, required: required.includes(fname), type: ft });
    }
    const t: ObjectType = { kind: 'object', fields };
    if (typeof s.description === 'string') t.description = s.description;
    if (s.additionalProperties === false) t.strict = true;
    main = t;
  } else {
    warnings.push(`${path}: unsupported or missing type`);
    return undefined;
  }

  if (!main) return undefined;

  // nullable: true (OpenAPI 3.0 pattern) — wrap main type in union with null
  if (s.nullable === true) {
    warnings.push(
      `${path}: nullable: true is a 3.0 pattern; wrapping in union with null`,
    );
    main = { kind: 'union', variants: [main, { kind: 'null' }] } as UnionType;
  }

  // example passthrough — only attached to object or array outputs
  if (s.example !== undefined && (main.kind === 'object' || main.kind === 'array')) {
    (main as ObjectType | ArrayType & { example?: unknown }).example = s.example;
  }

  return main;
}

// ---------------------------------------------------------------------------
// Operation → Endpoint
// ---------------------------------------------------------------------------

function readOperation(
  path: string,
  method: string,
  op: Record<string, unknown>,
  pathLevelParams: unknown[],
  warnings: string[],
  keyMap: Record<string, string>,
): Endpoint | undefined {
  const base = `paths.${path}.${method}`;

  const opParams = Array.isArray(op.parameters) ? (op.parameters as unknown[]) : [];
  const allParams = [...pathLevelParams, ...opParams];

  const pathParams: ParamDef[] = [];
  const queryParams: ParamDef[] = [];
  const headers: ParamDef[] = [];

  for (let i = 0; i < allParams.length; i++) {
    const p = allParams[i] as Record<string, unknown>;
    if (!p || typeof p !== 'object') continue;
    const name = typeof p.name === 'string' ? p.name : undefined;
    const inLoc = typeof p.in === 'string' ? p.in : undefined;
    if (!name || !inLoc) continue;

    const typeDef = p.schema
      ? readSchema(p.schema, warnings, `${base}.parameters[${i}].schema`, keyMap)
      : ({ kind: 'string' } as TypeDef);
    if (!typeDef) continue;

    const def: ParamDef = {
      name,
      required: p.required === true || inLoc === 'path',
      type: typeDef,
      ...(typeof p.description === 'string' ? { description: p.description } : {}),
    };

    if (inLoc === 'path') pathParams.push(def);
    else if (inLoc === 'query') queryParams.push(def);
    else if (inLoc === 'header') headers.push(def);
    else warnings.push(`${base}: parameter "${name}" has unsupported in: ${inLoc}`);
  }

  // requestBody
  let requestBody: TypeDef | null = null;
  const rb = op.requestBody as Record<string, unknown> | undefined;
  if (rb && typeof rb === 'object') {
    const content = rb.content as Record<string, unknown> | undefined;
    const jsonEntry = content?.['application/json'] as Record<string, unknown> | undefined;
    if (jsonEntry?.schema) {
      const parsed = readSchema(jsonEntry.schema, warnings, `${base}.requestBody.content.application/json.schema`, keyMap);
      if (parsed) requestBody = parsed;
    } else if (content && Object.keys(content).length > 0) {
      warnings.push(`${base}: requestBody content types other than application/json are not supported`);
    }
  }

  // responses
  const responses: ResponseDef[] = [];
  const resMap = (op.responses ?? {}) as Record<string, unknown>;
  for (const [statusKey, raw] of Object.entries(resMap)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const content = r.content as Record<string, unknown> | undefined;
    const jsonEntry = content?.['application/json'] as Record<string, unknown> | undefined;
    const t = jsonEntry?.schema
      ? readSchema(jsonEntry.schema, warnings, `${base}.responses[${statusKey}].schema`, keyMap)
      : undefined;
    if (!t) continue;

    let status: number;
    if (statusKey === 'default') {
      warnings.push(`${base}: default response mapped to status 0`);
      status = 0;
    } else {
      const parsed = Number(statusKey);
      if (!Number.isFinite(parsed)) continue;
      status = parsed;
    }
    responses.push({ status, type: t });
  }

  const tags = Array.isArray(op.tags)
    ? (op.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : undefined;

  const xFolder = typeof op['x-folder'] === 'string' && (op['x-folder'] as string).length > 0
    ? (op['x-folder'] as string)
    : undefined;

  const description =
    (typeof op.summary === 'string' && op.summary)
      || (typeof op.description === 'string' ? op.description : undefined)
      || undefined;

  const endpoint: Endpoint = {
    id: cryptoRandomId(),
    method: method.toUpperCase() as Endpoint['method'],
    path,
    ...(description ? { description } : {}),
    pathParams,
    queryParams,
    headers,
    requestBody,
    responses,
    auth: 'inherit',
    useProxy: 'inherit',
    ...(tags && tags.length ? { tags } : {}),
    ...(xFolder ? { folder: xFolder } : {}),
  };
  return endpoint;
}

function cryptoRandomId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback (should not hit in real browsers/Node 20+).
  return Math.random().toString(36).slice(2);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a list of subschemas as union variants.
 * Single-element lists are unwrapped (no unnecessary union wrapper).
 */
function readUnion(
  items: unknown[],
  warnings: string[],
  path: string,
  label: string,
  keyMap?: Record<string, string>,
): TypeDef | undefined {
  const variants = items
    .map((v, i) => readSchema(v, warnings, `${path}.${label}[${i}]`, keyMap))
    .filter((v): v is TypeDef => v !== undefined);
  if (variants.length === 0) {
    warnings.push(`${path}: ${label} resolved to nothing`);
    return undefined;
  }
  if (variants.length === 1) return variants[0];
  return { kind: 'union', variants };
}

/**
 * Merge allOf members into a single object type.
 * All members must resolve to object schemas; any non-object member causes a
 * warning and returns undefined. Field deduplication uses first-write-wins:
 * the first occurrence of a field name is kept, later duplicates are ignored.
 */
function readAllOf(
  items: unknown[],
  warnings: string[],
  path: string,
  keyMap?: Record<string, string>,
): TypeDef | undefined {
  const parts = items
    .map((v, i) => readSchema(v, warnings, `${path}.allOf[${i}]`, keyMap))
    .filter((v): v is TypeDef => v !== undefined);
  if (parts.some((p) => p.kind !== 'object')) {
    warnings.push(`${path}: allOf member is not an object — not supported`);
    return undefined;
  }
  const fields: ObjectField[] = [];
  const seenNames = new Set<string>();
  for (const p of parts) {
    if (p.kind !== 'object') continue;
    for (const f of p.fields) {
      if (seenNames.has(f.name)) continue;
      seenNames.add(f.name);
      fields.push(f);
    }
  }
  const firstDesc = parts
    .map((p) => (p.kind === 'object' ? p.description : undefined))
    .find((d): d is string => !!d);
  const anyStrict = parts.some((p) => p.kind === 'object' && p.strict === true);
  return {
    kind: 'object',
    fields,
    ...(firstDesc ? { description: firstDesc } : {}),
    ...(anyStrict ? { strict: true } : {}),
  };
}

/** Strip the flattened folder prefix from a schema key to recover the short name. */
function shortNameFor(flat: string, folder: string): string {
  const prefix = `${folder.replace(/\//g, '_')}_`;
  return flat.startsWith(prefix) ? flat.slice(prefix.length) : flat;
}
