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

async function runTsGenerator(
  spec: Spec,
  outDir: string,
  opts: { client: boolean; types: boolean; schemas: boolean },
): Promise<void> {
  if (opts.types !== false) {
    const { generateTs } = await import('@zwaggen/core');
    await writeOut(outDir, 'types.ts', generateTs(spec));
  }
  if (opts.schemas !== false) {
    const { generateZod } = await import('@zwaggen/core');
    await writeOut(outDir, 'schemas.ts', generateZod(spec));
  }
  if (opts.client) {
    const { generateClient } = await import('@zwaggen/core');
    await writeOut(outDir, 'client.ts', generateClient(spec));
  }
}

async function runZodGenerator(spec: Spec, outDir: string): Promise<void> {
  const { generateZod } = await import('@zwaggen/core');
  await writeOut(outDir, 'schemas.ts', generateZod(spec));
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
        const outDir = resolve(opts.out);
        if (opts.watch) {
          const { watchSpec } = await import('./watch.js');
          const dispose = await watchSpec(resolve(specPath), async (spec) => {
            await runTsGenerator(spec, outDir, opts);
            console.log(`regenerated → ${outDir}`);
          });
          process.on('SIGINT', () => {
            void dispose().then(() => process.exit(0));
          });
          return; // hold open
        }
        const spec = await loadSpec(resolve(specPath));
        await runTsGenerator(spec, outDir, opts);
        console.log(`generated TS into ${outDir}`);
      },
    );

  gen
    .command('zod <spec>')
    .description('Generate Zod schemas only')
    .option('--out <dir>', 'Output directory', './zwaggen-generated')
    .option('--watch', 'Re-run on spec change', false)
    .action(async (specPath: string, opts: { out: string; watch: boolean }) => {
      const outDir = resolve(opts.out);
      if (opts.watch) {
        const { watchSpec } = await import('./watch.js');
        const dispose = await watchSpec(resolve(specPath), async (spec) => {
          await runZodGenerator(spec, outDir);
          console.log(`regenerated → ${outDir}`);
        });
        process.on('SIGINT', () => {
          void dispose().then(() => process.exit(0));
        });
        return;
      }
      const spec = await loadSpec(resolve(specPath));
      await runZodGenerator(spec, outDir);
      console.log(`generated schemas.ts into ${outDir}`);
    });
}
