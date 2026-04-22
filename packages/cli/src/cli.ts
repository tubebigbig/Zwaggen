import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { diffCommand } from './commands/diff.js';
import { registerGenerate } from './generate/index.js';

const program = new Command();
program
  .name('zwag')
  .description('Zwaggen CI CLI — batch run + diff specs')
  .version('0.1.0');

program
  .command('run <specPath>')
  .description('Run every endpoint in the spec and report pass/fail')
  .option('--base-url <url>', 'Override spec base URL')
  .option('--filter <regex>', 'Only run endpoints whose "METHOD /path" matches')
  .action(async (specPath: string, opts: { baseUrl?: string; filter?: string }) => {
    const code = await runCommand(specPath, opts);
    process.exit(code);
  });

program
  .command('diff <baseSpec> <currentSpec>')
  .description('Diff two specs; exit 1 if breaking changes found')
  .action(async (baseSpec: string, currentSpec: string) => {
    const code = await diffCommand(baseSpec, currentSpec);
    process.exit(code);
  });

registerGenerate(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
