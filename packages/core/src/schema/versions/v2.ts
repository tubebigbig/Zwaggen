// Frozen pre-extends shape. Used as the input type of the v2→v3 migration.
// Only ObjectType differs from the current shape (no `extends` field); all
// other types are structurally identical so we re-export them.

import type {
  HttpMethod,
  StringType,
  NumberType,
  IntegerType,
  BooleanType,
  NullType,
  LiteralType,
  ArrayType,
  UnionType,
  RefType,
  ObjectField,
  ParamDef,
  AuthPreset,
  ResponseDef,
  Assertions,
  Capture,
  EnvVariable,
  Environment,
  Endpoint,
} from '../types';

export interface SpecV2ObjectType {
  kind: 'object';
  description?: string;
  strict?: boolean;
  fields: ObjectField[];
  example?: unknown;
  // NOTE: no `extends` field — v2 predates type inheritance.
}

export type SpecV2TypeDef =
  | StringType
  | NumberType
  | IntegerType
  | BooleanType
  | NullType
  | LiteralType
  | ArrayType
  | SpecV2ObjectType
  | UnionType
  | RefType;

export interface SpecV2 {
  schemaVersion: 2;
  info: {
    name: string;
    version?: string;
    description?: string;
    baseUrl?: string;
  };
  types: Record<string, SpecV2TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: Endpoint[];
}

// Unused imports suppressed; re-exported to keep the module self-contained
// for future v3 → v4 migrations that may need to diff against v2.
export type {
  HttpMethod,
  StringType,
  NumberType,
  IntegerType,
  BooleanType,
  NullType,
  LiteralType,
  ArrayType,
  UnionType,
  RefType,
  ObjectField,
  ParamDef,
  AuthPreset,
  ResponseDef,
  Assertions,
  Capture,
  EnvVariable,
  Environment,
  Endpoint,
};
