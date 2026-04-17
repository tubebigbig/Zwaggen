import { CURRENT_SCHEMA_VERSION, Spec } from './types';

export function emptySpec(name = 'Untitled API'): Spec {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    info: { name },
    types: {},
    environments: { default: { variables: [] } },
    activeEnvironment: 'default',
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [],
  };
}
