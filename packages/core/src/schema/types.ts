export const CURRENT_SCHEMA_VERSION = 5 as const;

export type BodyContentType = 'json' | 'urlencoded' | 'multipart';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type TypeDef =
  | StringType | NumberType | IntegerType | BooleanType | NullType
  | LiteralType | ArrayType | ObjectType | UnionType | RefType;

export interface StringType {
  kind: 'string';
  description?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
}
export interface NumberType {
  kind: 'number';
  description?: string;
  min?: number;
  max?: number;
  enum?: number[];
}
export interface IntegerType {
  kind: 'integer';
  description?: string;
  min?: number;
  max?: number;
  enum?: number[];
}
export interface BooleanType { kind: 'boolean'; description?: string }
export interface NullType { kind: 'null'; description?: string }
export interface LiteralType {
  kind: 'literal';
  value: string | number | boolean | null;
  description?: string;
}
export interface ArrayType {
  kind: 'array';
  element: TypeDef;
  description?: string;
  minItems?: number;
  maxItems?: number;
  example?: unknown;
}
export interface ObjectField {
  name: string;
  required: boolean;
  type: TypeDef;
  description?: string;
}
export interface ObjectType {
  kind: 'object';
  description?: string;
  strict?: boolean;
  fields: ObjectField[];
  example?: unknown;
  /**
   * Ordered list of parent type keys (canonical path form, e.g. `"auth/User"`).
   * Undefined or empty = no inheritance. Parents merged left-to-right; child
   * fields override any inherited field with the same name. See
   * `schema/resolveObject.ts` for the flattening semantics.
   */
  extends?: string[];
}
export interface UnionType { kind: 'union'; description?: string; variants: TypeDef[] }
export interface RefType { kind: 'ref'; ref: string; description?: string }

export interface ParamDef {
  name: string;
  required: boolean;
  type: TypeDef;
  description?: string;
}

export type AuthPreset =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; in: 'header' | 'query'; name: string; value: string };

export interface ResponseDef { status: number; type: TypeDef }

export interface Assertions {
  expectedStatus?: number;
  maxLatencyMs?: number;
  requiredHeaders?: Array<{ name: string; value: string }>;
}

export interface Capture {
  path: string;
  setVar: string;
  envName?: string;
}

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];
  queryParams: ParamDef[];
  headers: ParamDef[];
  requestBody: TypeDef | null;
  /**
   * Selects how the request body is encoded. `undefined` is treated as
   * `'json'` for backward compatibility with v4 specs. When set to
   * `'urlencoded'` or `'multipart'`, `bodyForm` carries the field defs and
   * `requestBody` should be left `null`.
   */
  bodyContentType?: BodyContentType;
  /**
   * Form fields used when `bodyContentType` is `'urlencoded'` or
   * `'multipart'`. Pure text-fields only in v1; file uploads land in
   * Body UX v1.1.
   */
  bodyForm?: ParamDef[];
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
  /**
   * Vendor extensions (`x-*` keys) captured from OpenAPI operations on import
   * and re-emitted unchanged on export. Excludes `x-folder` which is consumed
   * semantically into `folder`. See `docs/rules/spec-versioning.md`.
   */
  extensions?: Record<string, unknown>;
}

export interface EnvVariable {
  name: string;
  value: string;
  secret: boolean;
}
export interface Environment { variables: EnvVariable[] }

export interface Spec {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: Endpoint[];
}
