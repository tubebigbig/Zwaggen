import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromJSON } from '@zwaggen/core';
import { generateTs } from '../../src/generate/types.js';
import { generateZod } from '../../src/generate/zod.js';
import { generateClient } from '../../src/generate/client.js';
import { format } from '../../src/generate/format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadSpec() {
  const raw = await readFile(join(__dirname, 'fixtures/codegen-fixture.json'), 'utf8');
  return fromJSON(JSON.parse(raw));
}

describe('determinism — same spec → byte-identical output', () => {
  it('generateTs is deterministic', async () => {
    const spec = await loadSpec();
    const a = await format(generateTs(spec));
    const b = await format(generateTs(spec));
    expect(a).toBe(b);
  });

  it('generateZod is deterministic', async () => {
    const spec = await loadSpec();
    const a = await format(generateZod(spec));
    const b = await format(generateZod(spec));
    expect(a).toBe(b);
  });

  it('generateClient is deterministic', async () => {
    const spec = await loadSpec();
    const a = await format(generateClient(spec));
    const b = await format(generateClient(spec));
    expect(a).toBe(b);
  });
});
