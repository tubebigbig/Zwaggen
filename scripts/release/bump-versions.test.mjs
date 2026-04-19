import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bumpVersions } from './bump-versions.mjs';

describe('bumpVersions', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zw-bump-'));
    mkdirSync(join(dir, 'a'), { recursive: true });
    mkdirSync(join(dir, 'b'), { recursive: true });
    writeFileSync(join(dir, 'a', 'package.json'),
      JSON.stringify({ name: 'a', version: '0.1.0', other: 'kept' }, null, 2) + '\n');
    writeFileSync(join(dir, 'b', 'package.json'),
      JSON.stringify({ name: 'b', version: '0.1.0' }, null, 2) + '\n');
  });

  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('updates the version field in every passed package.json', () => {
    bumpVersions('0.2.0', [join(dir, 'a/package.json'), join(dir, 'b/package.json')]);
    const a = JSON.parse(readFileSync(join(dir, 'a/package.json'), 'utf8'));
    const b = JSON.parse(readFileSync(join(dir, 'b/package.json'), 'utf8'));
    expect(a.version).toBe('0.2.0');
    expect(b.version).toBe('0.2.0');
  });

  it('preserves other fields and key order', () => {
    bumpVersions('0.2.0', [join(dir, 'a/package.json')]);
    const raw = readFileSync(join(dir, 'a/package.json'), 'utf8');
    const a = JSON.parse(raw);
    expect(a.name).toBe('a');
    expect(a.other).toBe('kept');
    // version key still appears before "other"
    expect(raw.indexOf('"version"')).toBeLessThan(raw.indexOf('"other"'));
  });

  it('is idempotent — running twice with the same version is a no-op', () => {
    bumpVersions('0.2.0', [join(dir, 'a/package.json')]);
    const first = readFileSync(join(dir, 'a/package.json'), 'utf8');
    bumpVersions('0.2.0', [join(dir, 'a/package.json')]);
    const second = readFileSync(join(dir, 'a/package.json'), 'utf8');
    expect(second).toBe(first);
  });

  it('throws if a target file does not exist', () => {
    expect(() => bumpVersions('0.2.0', [join(dir, 'missing/package.json')])).toThrow();
  });
});
