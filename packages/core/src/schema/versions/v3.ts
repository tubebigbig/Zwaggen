// packages/core/src/schema/versions/v3.ts
// Frozen shape of Spec at schemaVersion 3 (before Endpoint.extensions was added).

import type {
  HttpMethod, TypeDef, ParamDef, ResponseDef, AuthPreset,
  Environment, Assertions, Capture,
} from '../types';

export interface EndpointV3 {
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
  folder?: string;
  assertions?: Assertions;
  captures?: Capture[];
}

export interface SpecV3 {
  schemaVersion: 3;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: EndpointV3[];
}
