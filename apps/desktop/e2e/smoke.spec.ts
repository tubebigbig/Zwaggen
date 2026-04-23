import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startStub, type Stub } from './stub-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let win: Page;
let stub: Stub;
let specPath: string;

test.beforeAll(async () => {
  stub = await startStub();
  const dir = await mkdtemp(path.join(tmpdir(), 'zwag-smoke-'));
  const fixture = await readFile(path.join(__dirname, 'fixtures/cors-test.zwag.json'), 'utf8');
  specPath = path.join(dir, 'cors-test.zwag.json');
  await writeFile(specPath, fixture.replace('__STUB_URL__', stub.url), 'utf8');

  // Assumes `pnpm --filter @zwaggen/web build` has been run beforehand
  // (the package.json `e2e` script also runs `pnpm build` for the desktop dist).
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist', 'main.cjs')],
    env: { ...process.env, ZWAGGEN_DEV_URL: '' },
  });
  win = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
  await stub?.close();
});

test('CORS bypass: invoking the bridge HTTP transport hits a localhost server', async () => {
  // Drive the bridge directly — no native dialog needed. Proves that the IPC
  // round-trip from renderer → main → Node fetch → localhost:port works,
  // which is the entire architectural claim of the slice.
  const resp = await win.evaluate(async (url) => {
    const z = (window as { zwaggen?: {
      sendHttpRequest: (req: { method: string; url: string; headers: Record<string, string> })
        => Promise<{ ok: boolean; status: number; rawText: string }>;
    } }).zwaggen;
    if (!z) throw new Error('window.zwaggen missing — preload did not run');
    return await z.sendHttpRequest({ method: 'GET', url: `${url}/echo`, headers: {} });
  }, stub.url);

  expect(resp.ok).toBe(true);
  expect(resp.status).toBe(200);
  expect(JSON.parse(resp.rawText)).toEqual({ ok: true, path: '/echo' });

  // Also verify openByPath round-trips a real file from disk through IPC.
  const opened = await win.evaluate(async (p) => {
    const z = (window as { zwaggen?: { openByPath: (p: string) => Promise<{ name: string; text: string } | null> } }).zwaggen;
    return await z!.openByPath(p);
  }, specPath);
  expect(opened?.name).toBe('cors-test.zwag.json');
  expect(opened?.text).toContain('CORS smoke test');
});
