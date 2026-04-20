import { CURRENT_SCHEMA_VERSION, Spec } from './types';
import { migrate } from './migrations';

// Inlined from apps/web/src/storage/drafts.ts — keeps @zwaggen/core free of
// storage-layer imports. Kept identical so apps/web and @zwaggen/core agree
// on shape.
export type SecretStore = Record<string /* envName */, Record<string /* varName */, string>>;

export class SpecVersionError extends Error {
  constructor(public readonly found: unknown) {
    super(messageFor(found));
  }
}

function messageFor(found: unknown): string {
  if (found === undefined) return 'Spec file is missing schemaVersion';
  if (typeof found !== 'number') {
    return `Spec file's schemaVersion must be a number, got ${JSON.stringify(found)} — if you edited the file by hand, make sure it's an integer (e.g., ${CURRENT_SCHEMA_VERSION}), not a string.`;
  }
  if (!Number.isInteger(found) || found < 1) {
    return `Spec file's schemaVersion must be a positive integer, got ${found}.`;
  }
  // Version is a valid positive integer but outside the migration chain —
  // either older-than-v1 (impossible by definition) or newer-than-current.
  return `Spec file uses schemaVersion ${found} which this app does not support (expected 1..${CURRENT_SCHEMA_VERSION} — v1 auto-migrates, ${CURRENT_SCHEMA_VERSION} is current).`;
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
  const v = (raw as Record<string, unknown>).schemaVersion;
  if (v === undefined) throw new SpecVersionError(undefined);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new SpecVersionError(v);
  }
  try {
    return migrate(raw, v);
  } catch {
    // migrate() throws plain Errors for "newer than app" or "no migration
    // path" — re-wrap as SpecVersionError so consumers see a single type.
    throw new SpecVersionError(v);
  }
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
