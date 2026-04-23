import { CURRENT_SCHEMA_VERSION, type Spec } from './types';
import type { SpecV1 } from './versions/v1';
import type { SpecV3 } from './versions/v3';
import type { SpecV4 } from './versions/v4';

interface Migration<FromV extends number, ToV extends number> {
  from: FromV;
  to: ToV;
  /** Returns a NEW object; must never mutate the input. */
  migrate(input: any): any;
}

/**
 * Ordered ascending by `from`. Each entry's `to` must equal the next entry's
 * `from` — the chain is contiguous, so a migrator at `CURRENT_SCHEMA_VERSION - 1`
 * always exists and the walker can always reach `CURRENT_SCHEMA_VERSION` from
 * any supported version. Adding a new version = appending one entry.
 */
export const MIGRATIONS: Migration<number, number>[] = [
  {
    from: 1,
    to: 2,
    // v1 → v2: folders were added. v1 endpoints have no `folder` field;
    // `folder` is optional on v2's Endpoint so absence == root folder.
    // No data transformation — just stamp the version.
    migrate: (spec: SpecV1): Spec => ({ ...spec, schemaVersion: 2 }) as unknown as Spec,
  },
  {
    from: 2,
    to: 3,
    // v2 → v3: added `extends?: string[]` on ObjectType. v2 has no extends,
    // so absence = no inheritance, same as v2 behavior. Pure version stamp.
    migrate: (spec: import('./versions/v2').SpecV2): Spec =>
      ({ ...spec, schemaVersion: 3 }) as unknown as Spec,
  },
  {
    from: 3,
    to: 4,
    // v3 → v4: added `extensions?: Record<string, unknown>` on Endpoint.
    // v3 has no extensions field, so absence = no extensions, same behavior
    // as v3. Pure version stamp.
    migrate: (spec: SpecV3): Spec =>
      ({ ...spec, schemaVersion: 4 }) as unknown as Spec,
  },
  {
    from: 4,
    to: 5,
    // v4 → v5: added optional `bodyContentType` + `bodyForm` on Endpoint.
    // Both fields are optional; absence of `bodyContentType` is treated as
    // `'json'` by the runner, so existing v4 endpoints behave identically.
    // Pure version stamp.
    migrate: (spec: SpecV4): Spec =>
      ({ ...spec, schemaVersion: 5 }) as unknown as Spec,
  },
];

/**
 * Walk the migration chain from `inputVersion` up to `CURRENT_SCHEMA_VERSION`.
 *
 * Throws if:
 *   - `inputVersion > CURRENT_SCHEMA_VERSION` (user needs a newer app)
 *   - no registered migration has `from === currentVersion` (chain is broken,
 *     which means a migration entry is missing — a bug)
 */
export function migrate(raw: unknown, inputVersion: number): Spec {
  if (inputVersion === CURRENT_SCHEMA_VERSION) return raw as Spec;
  if (inputVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Spec file uses schemaVersion ${inputVersion} which is newer than this app supports (current: ${CURRENT_SCHEMA_VERSION}). Update the app.`,
    );
  }
  let current: any = raw;
  let currentVersion = inputVersion;
  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === currentVersion);
    if (!step) {
      throw new Error(
        `No migration path from schemaVersion ${currentVersion} to ${CURRENT_SCHEMA_VERSION}. This is a bug — a migration entry is missing.`,
      );
    }
    current = step.migrate(current);
    currentVersion = step.to;
  }
  return current as Spec;
}
