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
} from '../schema/types';

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

  for (const [name, raw] of Object.entries(schemas)) {
    const t = readSchema(raw, warnings, `components.schemas.${name}`);
    if (t) spec.types[name] = t;
  }

  // Paths/endpoints added in Task 3.
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
): TypeDef | undefined {
  if (typeof raw !== 'object' || raw === null) {
    warnings.push(`${path}: expected object schema`);
    return undefined;
  }
  const s = raw as Record<string, unknown>;

  // $ref — local #/components/schemas/ only
  if (typeof s.$ref === 'string') {
    const localPrefix = '#/components/schemas/';
    if (s.$ref.startsWith(localPrefix)) {
      return { kind: 'ref', ref: s.$ref.slice(localPrefix.length) };
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
    return t;
  }

  if (type === 'number') {
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
    return t;
  }

  if (type === 'integer') {
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
    return t;
  }

  if (type === 'boolean') {
    const t: BooleanType = { kind: 'boolean' };
    if (typeof s.description === 'string') t.description = s.description;
    return t;
  }

  if (type === 'null') {
    return { kind: 'null' };
  }

  if (type === 'array') {
    const element =
      s.items !== undefined
        ? readSchema(s.items, warnings, `${path}.items`)
        : undefined;
    if (!element) {
      warnings.push(`${path}: array missing items`);
      return undefined;
    }
    const t: ArrayType = { kind: 'array', element };
    if (typeof s.minItems === 'number') t.minItems = s.minItems;
    if (typeof s.maxItems === 'number') t.maxItems = s.maxItems;
    if (typeof s.description === 'string') t.description = s.description;
    return t;
  }

  if (type === 'object') {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const required = Array.isArray(s.required)
      ? (s.required as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : [];
    const fields: ObjectField[] = [];
    for (const [fname, fraw] of Object.entries(props)) {
      const ft = readSchema(fraw, warnings, `${path}.properties.${fname}`);
      if (!ft) continue;
      fields.push({ name: fname, required: required.includes(fname), type: ft });
    }
    const t: ObjectType = { kind: 'object', fields };
    if (typeof s.description === 'string') t.description = s.description;
    if (s.additionalProperties === false) t.strict = true;
    return t;
  }

  warnings.push(`${path}: unsupported or missing type`);
  return undefined;
}
