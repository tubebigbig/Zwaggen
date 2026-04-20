const SEGMENT = /^[A-Za-z0-9_. -]+$/;

export function isValidSegment(s: string): boolean {
  return SEGMENT.test(s);
}

/**
 * Returns:
 *   string  — a canonical path with no leading/trailing slash and no empty segments.
 *   undefined — the input means "no folder" (empty, whitespace, or slash-only).
 *   null    — contains an invalid segment.
 */
export function normalizeFolder(raw: string): string | undefined | null {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const segments = trimmed.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length === 0) return undefined;
  for (const s of segments) {
    if (!isValidSegment(s)) return null;
  }
  return segments.join('/');
}

/** Expects a canonical key — no leading/trailing slash, no empty segments. Garbage-in-garbage-out otherwise. */
export function splitKey(key: string): { folder: string | undefined; name: string } {
  const i = key.lastIndexOf('/');
  if (i < 0) return { folder: undefined, name: key };
  return { folder: key.slice(0, i), name: key.slice(i + 1) };
}

/** Caller must pass an already-normalized folder (via normalizeFolder) or undefined. No re-normalization. */
export function joinKey(folder: string | undefined, name: string): string {
  if (!folder) return name;
  return `${folder}/${name}`;
}

/** True if `key`'s folder equals `prefix` or is a descendant (sibling-prefix-safe). */
export function childOf(key: string, prefix: string): boolean {
  const { folder } = splitKey(key);
  if (!folder) return false;
  return folder === prefix || folder.startsWith(`${prefix}/`);
}
