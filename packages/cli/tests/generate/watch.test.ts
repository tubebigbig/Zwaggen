import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchSpec } from '../../src/generate/watch.js';

describe('watchSpec', () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  });

  it('fires onChange when the spec file is modified (debounced)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zwag-watch-'));
    const specPath = join(dir, 'spec.json');
    const v1 = JSON.stringify({
      schemaVersion: 1,
      info: { name: 'v1' },
      useProxyDefault: false,
      auth: { type: 'none' },
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      types: {},
      endpoints: [],
    });
    const v2 = JSON.stringify({
      schemaVersion: 1,
      info: { name: 'v2' },
      useProxyDefault: false,
      auth: { type: 'none' },
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      types: {},
      endpoints: [],
    });
    await writeFile(specPath, v1, 'utf8');

    const observed: string[] = [];
    cleanup = await watchSpec(specPath, async (spec) => {
      observed.push(spec.info.name);
    });

    // Initial run.
    await new Promise((r) => setTimeout(r, 100));
    expect(observed).toEqual(['v1']);

    await writeFile(specPath, v2, 'utf8');
    // Wait for debounce (200ms) + fire margin.
    await new Promise((r) => setTimeout(r, 600));
    expect(observed).toEqual(['v1', 'v2']);

    await rm(dir, { recursive: true, force: true });
  }, 10000);
});
