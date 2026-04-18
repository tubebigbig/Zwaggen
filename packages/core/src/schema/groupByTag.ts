import type { Endpoint } from './types';

export interface Group { tag: string | null; endpoints: Endpoint[] }

export function groupByTag(endpoints: Endpoint[]): Group[] {
  const byTag = new Map<string, Endpoint[]>();
  const untagged: Endpoint[] = [];

  for (const e of endpoints) {
    const tags = Array.from(new Set((e.tags ?? []).filter((t) => t && t.trim())));
    if (tags.length === 0) { untagged.push(e); continue; }
    for (const t of tags) {
      const bucket = byTag.get(t) ?? [];
      bucket.push(e);
      byTag.set(t, bucket);
    }
  }

  const out: Group[] = [...byTag.entries()]
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([tag, list]) => ({ tag, endpoints: list }));
  if (untagged.length) out.push({ tag: null, endpoints: untagged });
  return out;
}
