// packages/core/src/schema/versions/v5.ts
// Frozen shape of Spec at schemaVersion 5 (before FileType was added to TypeDef
// for Body UX v1.1 multipart file uploads).

import type {
  HttpMethod, AuthPreset, BodyContentType,
  Environment, Assertions, Capture,
} from '../types';

// v5 TypeDef union — same as v6 minus FileType.
export type TypeDefV5 =
  | StringTypeV5 | NumberTypeV5 | IntegerTypeV5 | BooleanTypeV5 | NullTypeV5
  | LiteralTypeV5 | ArrayTypeV5 | ObjectTypeV5 | UnionTypeV5 | RefTypeV5;

export interface StringTypeV5 {
  kind: 'string';
  description?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
}
export interface NumberTypeV5 {
  kind: 'number';
  description?: string;
  min?: number;
  max?: number;
  enum?: number[];
}
export interface IntegerTypeV5 {
  kind: 'integer';
  description?: string;
  min?: number;
  max?: number;
  enum?: number[];
}
export interface BooleanTypeV5 { kind: 'boolean'; description?: string }
export interface NullTypeV5 { kind: 'null'; description?: string }
export interface LiteralTypeV5 {
  kind: 'literal';
  value: string | number | boolean | null;
  description?: string;
}
export interface ArrayTypeV5 {
  kind: 'array';
  element: TypeDefV5;
  description?: string;
  minItems?: number;
  maxItems?: number;
  example?: unknown;
}
export interface ObjectFieldV5 {
  name: string;
  required: boolean;
  type: TypeDefV5;
  description?: string;
}
export interface ObjectTypeV5 {
  kind: 'object';
  description?: string;
  strict?: boolean;
  fields: ObjectFieldV5[];
  example?: unknown;
  extends?: string[];
}
export interface UnionTypeV5 { kind: 'union'; description?: string; variants: TypeDefV5[] }
export interface RefTypeV5 { kind: 'ref'; ref: string; description?: string }

export interface ParamDefV5 {
  name: string;
  required: boolean;
  type: TypeDefV5;
  description?: string;
}

export interface ResponseDefV5 { status: number; type: TypeDefV5 }

export interface EndpointV5 {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDefV5[];
  queryParams: ParamDefV5[];
  headers: ParamDefV5[];
  requestBody: TypeDefV5 | null;
  bodyContentType?: BodyContentType;
  bodyForm?: ParamDefV5[];
  responses: ResponseDefV5[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
  extensions?: Record<string, unknown>;
}

export interface SpecV5 {
  schemaVersion: 5;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDefV5>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: EndpointV5[];
}

