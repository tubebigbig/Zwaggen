// packages/core/src/schema/versions/v4.ts
// Frozen shape of Spec at schemaVersion 4 (before bodyContentType + bodyForm
// were added on Endpoint).

import type {
  HttpMethod, TypeDef, ParamDef, ResponseDef, AuthPreset,
  Environment, Assertions, Capture,
} from '../types';

export interface EndpointV4 {
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
  extensions?: Record<string, unknown>;
}

export interface SpecV4 {
  schemaVersion: 4;
  info: { name: string; version?: string; description?: string; baseUrl?: string };
  types: Record<string, TypeDef>;
  environments: Record<string, Environment>;
  activeEnvironment: string;
  auth: AuthPreset;
  useProxyDefault: boolean;
  endpoints: EndpointV4[];
}
