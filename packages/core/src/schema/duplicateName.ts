import type { Spec } from './types';
import { joinKey } from './folders';

/**
 * Returns the first non-colliding "{baseName}Copy" / "Copy2" / "Copy3" ...
 * for the given folder scope. Used when duplicating types so the new key
 * doesn't clash with an existing one in the same folder.
 */
export function nextAvailableTypeName(spec: Spec, baseName: string, folder?: string): string {
  const exists = (n: string) => spec.types[joinKey(folder, n)] !== undefined;
  const candidate = `${baseName}Copy`;
  if (!exists(candidate)) return candidate;
  let i = 2;
  while (exists(`${baseName}Copy${i}`)) i++;
  return `${baseName}Copy${i}`;
}
