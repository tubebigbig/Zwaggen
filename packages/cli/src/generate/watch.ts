import chokidar from 'chokidar';
import { readFile } from 'node:fs/promises';
import { fromJSON, type Spec } from '@zwaggen/core';

const DEBOUNCE_MS = 200;

export async function watchSpec(
  specPath: string,
  onChange: (spec: Spec) => Promise<void>,
): Promise<() => Promise<void>> {
  const run = async () => {
    try {
      const raw = await readFile(specPath, 'utf8');
      const spec = fromJSON(JSON.parse(raw));
      await onChange(spec);
    } catch (err) {
      console.error(
        `watch: failed to regenerate — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  await run(); // initial fire

  let timer: NodeJS.Timeout | null = null;
  const watcher = chokidar.watch(specPath, { ignoreInitial: true });
  watcher.on('change', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, DEBOUNCE_MS);
  });

  return async () => {
    if (timer) clearTimeout(timer);
    await watcher.close();
  };
}
