import { readFile } from 'node:fs/promises';
import { diffSpecs, fromJSON } from '@zwaggen/core';

export async function diffCommand(
  baseSpecPath: string,
  currentSpecPath: string,
): Promise<number> {
  let base, current;
  try {
    base = fromJSON(JSON.parse(await readFile(baseSpecPath, 'utf8')));
    current = fromJSON(JSON.parse(await readFile(currentSpecPath, 'utf8')));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  const diff = diffSpecs(base, current);

  console.log('Breaking changes:');
  if (diff.breaking.length === 0) {
    console.log('  (none)');
  } else {
    for (const c of diff.breaking) {
      console.log(`  [${c.kind}] ${c.location} — ${c.summary}`);
    }
  }
  console.log('');
  console.log('Non-breaking changes:');
  if (diff.nonBreaking.length === 0) {
    console.log('  (none)');
  } else {
    for (const c of diff.nonBreaking) {
      console.log(`  [${c.kind}] ${c.location} — ${c.summary}`);
    }
  }

  return diff.breaking.length > 0 ? 1 : 0;
}
