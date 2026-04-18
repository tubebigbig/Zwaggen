export function canonicalStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (v === undefined ? 'null' : canonicalStringify(v))).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    if (typeof v === 'function' || typeof v === 'symbol') continue;
    parts.push(JSON.stringify(k) + ':' + canonicalStringify(v));
  }
  return '{' + parts.join(',') + '}';
}
