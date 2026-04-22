import { Command } from 'commander';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fromJSON, type Spec } from '@zwaggen/core';
import { format } from './format.js';

async function loadSpec(path: string): Promise<Spec> {
  const raw = await readFile(path, 'utf8');
  return fromJSON(JSON.parse(raw));
}

async function writeOut(outDir: string, filename: string, source: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, filename), await format(source), 'utf8');
}

export function registerGenerate(program: Command): void {
  const gen = program.command('generate').description('Generate code from a .zwag spec');

  gen
    .command('ts <spec>')
    .description('Generate TypeScript types + Zod schemas + (optional) typed client')
    .option('--out <dir>', 'Output directory', './zwaggen-generated')
    .option('--client', 'Also emit client.ts (typed client object)', false)
    .option('--no-types', 'Skip types.ts')
    .option('--no-schemas', 'Skip schemas.ts')
    .option('--watch', 'Re-run on spec change', false)
    .action(
      async (
        specPath: string,
        opts: {
          out: string;
          client: boolean;
          types: boolean;
          schemas: boolean;
          watch: boolean;
        },
      ) => {
        const spec = await loadSpec(resolve(specPath));
        const outDir = resolve(opts.out);
        if (opts.types !== false) {
          const { generateTs } = await import('./types.js');
          await writeOut(outDir, 'types.ts', generateTs(spec));
        }
        if (opts.schemas !== false) {
          const { generateZod } = await import('./zod.js');
          await writeOut(outDir, 'schemas.ts', generateZod(spec));
        }
        // client wired in later tasks
        console.log(`generated TS into ${outDir}`);
      },
    );

  gen
    .command('zod <spec>')
    .description('Generate Zod schemas only')
    .option('--out <dir>', 'Output directory', './zwaggen-generated')
    .option('--watch', 'Re-run on spec change', false)
    .action(async (specPath: string, opts: { out: string; watch: boolean }) => {
      const spec = await loadSpec(resolve(specPath));
      const outDir = resolve(opts.out);
      const { generateZod } = await import('./zod.js');
      await writeOut(outDir, 'schemas.ts', generateZod(spec));
      console.log(`generated schemas.ts into ${outDir}`);
    });
}
