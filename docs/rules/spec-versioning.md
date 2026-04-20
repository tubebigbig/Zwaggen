# Spec File Versioning

The canonical JSON spec file MUST carry a top-level `schemaVersion: number` integer.

- **Current version:** `3`.
- **v1 → v2 (2026-04-20):** added folder support for types and endpoints. v1 specs load unchanged because absent folder fields mean root folder; the loader stamps `schemaVersion: 2` on read.
- **v2 → v3 (2026-04-20):** added `extends?: string[]` to `ObjectType` for multi-parent type inheritance. v2 specs load unchanged because absent `extends` means no inheritance; the loader stamps `schemaVersion: 3` on read.
- **Readers** must check `schemaVersion` first. If it is higher than the reader's supported version, the reader MUST refuse to load and surface a "newer version" error. Readers never attempt to silently ignore unknown fields from a newer version.
- **Writers** must emit the current version. When the canonical shape changes in a way that older readers cannot handle, bump the number.
- **Why:** prevents silent data loss when specs travel between versions of the app.

## Adding a new version

Each new schemaVersion ships as one migration entry + one frozen-shape file. Follow the steps in order:

1. **Freeze the current shape.** Copy the current `Spec` + any type that's about to change into `packages/core/src/schema/versions/vN.ts` as `SpecVN` (and `SpecVNEndpoint` etc. if endpoint-level types change). Don't mutate — the existing `types.ts` remains "the current shape" for live code.
2. **Bump the version.** In `packages/core/src/schema/types.ts`, set `CURRENT_SCHEMA_VERSION = N + 1` and make whatever forward-facing type changes the new version needs (add / rename / remove fields on `Spec`, `Endpoint`, etc.).
3. **Register the migration.** Append to `MIGRATIONS` in `packages/core/src/schema/migrations.ts`:
   ```ts
   {
     from: N,
     to: N + 1,
     migrate: (spec: SpecVN): Spec => ({ /* transform here */, schemaVersion: N + 1 }),
   },
   ```
   Return a NEW object; never mutate `spec`. If the transform is non-trivial, pull it into a named helper below `MIGRATIONS` for testability.
4. **Write tests.**
   - `migrations.test.ts`: vN payload upgrades cleanly; the chain walker handles v1 → v(N+1); MIGRATIONS length still equals `CURRENT_SCHEMA_VERSION - 1` with contiguous from/to values.
   - `serialize.test.ts`: a v(N+2) payload still throws the "does not support" message.
5. **Update this doc.** Bump the "Current version" line at the top and add a new bullet below the existing v1 → v2 note documenting what v(N+1) introduced.
6. **Ship behind a release.** Because the bump changes what the loader accepts, it must travel through `release.yml` alongside any app-side code changes that depend on the new shape.

**Testing invariant:** `packages/core/tests/schema/migrations.test.ts`'s "MIGRATIONS is a contiguous chain" case makes it impossible to merge a bump without a matching migration entry. If that test fails, you skipped a step.
