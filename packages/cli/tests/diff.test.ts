import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, '..', 'bin', 'zwag.js');

describe('zwag diff', () => {
  it('exits 0 when specs are identical', () => {
    const spec = join(__dirname, 'fixtures', 'spec-a.json');
    const result = spawnSync('node', [cli, 'diff', spec, spec], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Breaking changes:');
    expect(result.stdout).toMatch(/\(none\)/);
  });

  it('exits 1 when breaking changes exist', () => {
    const a = join(__dirname, 'fixtures', 'spec-a.json');
    const b = join(__dirname, 'fixtures', 'spec-b-breaking.json');
    const result = spawnSync('node', [cli, 'diff', a, b], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Breaking changes:');
    expect(result.stdout).toMatch(/endpoint\.removed/);
  });

  it('exits 2 on a missing file', () => {
    const missing = join(__dirname, 'fixtures', 'does-not-exist.json');
    const spec = join(__dirname, 'fixtures', 'spec-a.json');
    const result = spawnSync('node', [cli, 'diff', spec, missing], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/error:/);
  });
});
