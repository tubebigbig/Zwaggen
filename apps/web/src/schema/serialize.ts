import { CURRENT_SCHEMA_VERSION, Spec } from './types';
import type { SecretStore } from '../storage/drafts';

export class SpecVersionError extends Error {
  constructor(public readonly found: unknown) {
    super(
      found === undefined
        ? 'Spec file is missing schemaVersion'
        : `Spec file uses schemaVersion ${String(found)} which this app does not support (expected ${CURRENT_SCHEMA_VERSION})`,
    );
  }
}

const KEY_ORDER: Array<keyof Spec> = [
  'schemaVersion',
  'info',
  'types',
  'environments',
  'activeEnvironment',
  'auth',
  'useProxyDefault',
  'endpoints',
];

export function toJSON(spec: Spec): string {
  const ordered: Record<string, unknown> = {};
  for (const k of KEY_ORDER) ordered[k] = spec[k];
  return JSON.stringify(ordered, null, 2);
}

export function fromJSON(raw: unknown): Spec {
  if (typeof raw !== 'object' || raw === null) throw new SpecVersionError(undefined);
  const obj = raw as Record<string, unknown>;
  const v = obj.schemaVersion;
  if (v !== CURRENT_SCHEMA_VERSION) throw new SpecVersionError(v);
  // Trust the shape (app only reads its own output). Full structural
  // validation is not MVP — version gate is the load guard per
  // docs/rules/spec-versioning.md.
  return obj as unknown as Spec;
}

export function stripSecrets(spec: Spec): Spec {
  const envs: typeof spec.environments = {};
  for (const [k, env] of Object.entries(spec.environments)) {
    envs[k] = { variables: env.variables.map((v) => v.secret ? { ...v, value: '' } : v) };
  }
  return { ...spec, environments: envs };
}

export function extractSecrets(spec: Spec): SecretStore {
  const out: SecretStore = {};
  for (const [name, env] of Object.entries(spec.environments)) {
    const bucket: Record<string, string> = {};
    for (const v of env.variables) if (v.secret && v.value) bucket[v.name] = v.value;
    if (Object.keys(bucket).length) out[name] = bucket;
  }
  return out;
}
