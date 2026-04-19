import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderEntry, prependEntry } from './update-changelog.mjs';

describe('renderEntry', () => {
  it('formats version, date, and bullet list', () => {
    const out = renderEntry('0.2.0', '2026-04-19', ['feat: a thing', 'fix: another']);
    expect(out).toContain('## v0.2.0 — 2026-04-19');
    expect(out).toContain('- feat: a thing');
    expect(out).toContain('- fix: another');
  });
  it('falls back to "Initial release" when no commits', () => {
    const out = renderEntry('0.1.0', '2026-04-19', []);
    expect(out).toMatch(/Initial release/);
  });
  it('skips merge commits', () => {
    const out = renderEntry('0.2.0', '2026-04-19', ['feat: a', 'Merge branch x', 'fix: b']);
    expect(out).toContain('- feat: a');
    expect(out).toContain('- fix: b');
    expect(out).not.toContain('Merge branch x');
  });
  it('skips prior release commits ("release: vX.Y.Z")', () => {
    const out = renderEntry('0.3.0', '2026-04-19', ['feat: thing', 'release: v0.2.0']);
    expect(out).toContain('- feat: thing');
    expect(out).not.toContain('release: v0.2.0');
  });
});

describe('prependEntry', () => {
  let dir, file;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zw-cl-'));
    file = join(dir, 'CHANGELOG.md');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('inserts after the # Changelog header on a fresh file', () => {
    writeFileSync(file, '# Changelog\n\nIntro paragraph.\n\n## Unreleased\n\n_(empty)_\n');
    prependEntry(file, '0.2.0', '2026-04-19', ['feat: x']);
    const out = readFileSync(file, 'utf8');
    expect(out.startsWith('# Changelog\n')).toBe(true);
    const headerIdx = out.indexOf('# Changelog');
    const newSecIdx = out.indexOf('## v0.2.0');
    const unreleasedIdx = out.indexOf('## Unreleased');
    expect(headerIdx).toBeLessThan(newSecIdx);
    expect(newSecIdx).toBeLessThan(unreleasedIdx);
  });

  it('throws if the file has no # Changelog header', () => {
    writeFileSync(file, 'no header here\n');
    expect(() => prependEntry(file, '0.2.0', '2026-04-19', ['x'])).toThrow(/header/i);
  });

  it('is idempotent — running twice with the same version is a no-op (does not duplicate)', () => {
    writeFileSync(file, '# Changelog\n\n');
    prependEntry(file, '0.2.0', '2026-04-19', ['feat: x']);
    const first = readFileSync(file, 'utf8');
    prependEntry(file, '0.2.0', '2026-04-19', ['feat: x']);
    const second = readFileSync(file, 'utf8');
    expect(second).toBe(first);
  });
});
