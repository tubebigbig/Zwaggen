import type { Endpoint } from '@zwaggen/core';

const TS_RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'yield', 'as', 'implements', 'interface', 'let', 'package', 'private',
  'protected', 'public', 'static',
]);

const SAFE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function safeIdentifier(name: string): string {
  if (!SAFE_IDENT.test(name) || TS_RESERVED.has(name)) {
    return `'${name.replace(/'/g, "\\'")}'`;
  }
  return name;
}

/**
 * Returns the grouping tag for a codegen endpoint. The Zwaggen schema stores
 * tags as `tags?: string[]` (multi-tag), but the codegen treats endpoints as
 * belonging to a single namespace, so we use the first tag if present.
 *
 * Also tolerates a singular `tag?: string` shape (used by some fixtures and
 * upstream OpenAPI imports before normalization) and falls back to `'default'`
 * when the endpoint is untagged or carries an empty tag.
 */
export function tagForEndpoint(
  endpoint: Pick<Endpoint, 'tags'> & { tag?: string },
): string {
  if (typeof endpoint.tag === 'string' && endpoint.tag.length > 0) return endpoint.tag;
  const first = endpoint.tags?.[0];
  if (typeof first === 'string' && first.length > 0) return first;
  return 'default';
}

export function pathParamNames(path: string): string[] {
  const out: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) out.push(m[1]!);
  return out;
}

/**
 * Maps a folder-prefixed type key (e.g. `auth/User`) to a TS-safe identifier
 * (`auth_User`) by replacing every `/` with `_`. Used for top-level type names,
 * `extends` lists, and `ref` resolution so emitted code is consistent.
 *
 * Collision detection (`auth/User` vs `auth_User` both sanitizing to
 * `auth_User`) is performed at the start of each `generate*` pass; this helper
 * is purely string substitution.
 */
export function sanitizeFolderKey(name: string): string {
  return name.replace(/\//g, '_');
}
