// packages/core/src/schema/versions/v6.ts
// Frozen shape of Spec at schemaVersion 6 (before queryParams/headers were
// collapsed from ParamDef[] into ObjectType | RefType). Used by the v6 → v7
// migrator to wrap legacy flat-array query/header params into inline objects.

import type {
  AuthPreset, Assertions, Capture, HttpMethod, ResponseDef, ParamDef, TypeDef,
  Environment, BodyContentType,
} from '../types';

export interface EndpointV6 {
  id: string;
  method: HttpMethod;
  path: string;
  description?: string;
  pathParams: ParamDef[];
  queryParams: ParamDef[];
  headers: ParamDef[];
  requestBody: TypeDef | null;
  bodyContentType?: BodyContentType;
  bodyForm?: ParamDef[];
  responses: ResponseDef[];
  auth: AuthPreset | 'inherit';
  useProxy: boolean | 'inherit';
  tags?: string[];
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
  extensions?: Record<string, unknown>;
}

export interface SpecV6 {
  schemaVersion: 6;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: EndpointV6[];
}
