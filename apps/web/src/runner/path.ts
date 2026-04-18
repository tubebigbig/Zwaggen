export function parsePath(p: string): Array<string | number> | null {
  if (typeof p !== 'string' || p.length === 0) return null;
  const segments: Array<string | number> = [];
  let i = 0;
  while (i < p.length) {
    if (p[i] === '[') {
      const end = p.indexOf(']', i);
      if (end === -1) return null; // unterminated
      const inner = p.slice(i + 1, end);
      if (inner === '' || !/^\d+$/.test(inner)) return null;
      segments.push(Number(inner));
      i = end + 1;
      if (i < p.length && p[i] === '.') i++;
    } else {
      const nextDot = p.indexOf('.', i);
      const nextBracket = p.indexOf('[', i);
      const next = [nextDot, nextBracket].filter((n) => n !== -1).sort((a, b) => a - b)[0];
      const end = next === undefined ? p.length : next;
      const name = p.slice(i, end);
      if (name === '') return null;
      segments.push(name);
      i = end;
      if (i < p.length && p[i] === '.') i++;
    }
  }
  return segments.length > 0 ? segments : null;
}

/**
 * Extract a value from `body` by dot-path / bracket notation.
 *
 * `found` means the key exists in the parent object (uses the JS `in` operator
 * semantics). `value` may still be `undefined` if the caller explicitly stored
 * `undefined` at that key.
 */
export function extractByPath(body: unknown, path: string): { value: unknown; found: boolean } {
  const segments = parsePath(path);
  if (segments === null) return { value: undefined, found: false };

  let cur: unknown = body;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return { value: undefined, found: false };
    if (typeof seg === 'number') {
      if (!Array.isArray(cur)) return { value: undefined, found: false };
      if (seg < 0 || seg >= cur.length) return { value: undefined, found: false };
      cur = cur[seg];
      continue;
    }
    if (typeof cur !== 'object' || Array.isArray(cur)) return { value: undefined, found: false };
    const obj = cur as Record<string, unknown>;
    if (!(seg in obj)) return { value: undefined, found: false };
    cur = obj[seg];
  }
  return { value: cur, found: true };
}
