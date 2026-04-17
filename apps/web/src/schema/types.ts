export const CURRENT_SCHEMA_VERSION = 1 as const;

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

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];
  queryParams: ParamDef[];
  headers: ParamDef[];
  requestBody: TypeDef | null;
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
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
