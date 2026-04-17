# Spec File Versioning

The canonical JSON spec file MUST carry a top-level `schemaVersion: number` integer.

- **Current version:** `1`.
- **Readers** must check `schemaVersion` first. If it is higher than the reader's supported version, the reader MUST refuse to load and surface a "newer version" error. Readers never attempt to silently ignore unknown fields from a newer version.
- **Writers** must emit the current version. When the canonical shape changes in a way that older readers cannot handle, bump the number.
- **Why:** prevents silent data loss when specs travel between versions of the app.
