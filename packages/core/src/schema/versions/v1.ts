// Frozen pre-folder spec shape. Used as the input type of the v1→v2 migration.
// When future versions change Endpoint/Spec shapes, add versions/v2.ts, v3.ts
// etc. and keep each one frozen — migrators need the OLD shape as input.

import type {
  HttpMethod,
  TypeDef,
  ParamDef,
  AuthPreset,
  ResponseDef,
  Assertions,
  Capture,
  Environment,
} from '../types';

export interface SpecV1Endpoint {
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
  tags?: string[];
  // NOTE: no `folder` field — v1 predates folders.
  assertions?: Assertions;
  captures?: Capture[];
}

export interface SpecV1 {
  schemaVersion: 1;
  info: {
    name: string;
    version?: string;
    description?: string;
    baseUrl?: string;
  };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: SpecV1Endpoint[];
}
