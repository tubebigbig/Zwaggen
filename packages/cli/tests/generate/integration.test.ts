import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { fromJSON, generateTs, generateZod, generateClient } from '@zwaggen/core';

const execFileP = promisify(execFile);
import { format } from '../../src/generate/format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('integration — generated code compiles + runs against a real HTTP server', () => {
  let tmpDir: string;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // 1. Generate code into tmp dir.
    tmpDir = await mkdtemp(join(tmpdir(), 'zwag-int-'));
    const fixtureRaw = await readFile(
      join(__dirname, 'fixtures/codegen-fixture.json'),
      'utf8',
    );
    const spec = fromJSON(JSON.parse(fixtureRaw));
    await writeFile(join(tmpDir, 'types.ts'), await format(generateTs(spec)), 'utf8');
    await writeFile(join(tmpDir, 'schemas.ts'), await format(generateZod(spec)), 'utf8');
    await writeFile(join(tmpDir, 'client.ts'), await format(generateClient(spec)), 'utf8');

    // 2. Stand up package.json so we can install zod (for tsc + import) and tsx (to run .ts).
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'zwag-int',
        version: '0.0.0',
        type: 'module',
        dependencies: { zod: '^3.23.0' },
        devDependencies: { tsx: '^4.16.0' },
      }),
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'es2022',
          module: 'nodenext',
          moduleResolution: 'nodenext',
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['*.ts'],
      }),
      'utf8',
    );
    execSync('pnpm install --silent --no-frozen-lockfile', { cwd: tmpDir, stdio: 'pipe' });

    // 3. tsc --noEmit on the generated code.
    execSync('pnpm exec tsc', { cwd: tmpDir, stdio: 'pipe' });

    // 4. Start a fixture HTTP server with canned responses.
    server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      const url = req.url ?? '';
      if (req.method === 'GET' && url === '/users') {
        res.statusCode = 200;
        res.end(
          JSON.stringify([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
          ]),
        );
        return;
      }
      if (req.method === 'GET' && url.startsWith('/users/search')) {
        const echoHeaderId = req.headers['x-request-id'] ?? '<missing>';
        res.statusCode = 200;
        res.end(JSON.stringify([{ id: 'u1', name: `q=${url}; hdr=${echoHeaderId}` }]));
        return;
      }
      if (req.method === 'GET' && /^\/users\/[^/]+$/.test(url)) {
        res.statusCode = 200;
        res.end(JSON.stringify({ id: url.split('/').pop(), name: 'Alice' }));
        return;
      }
      if (req.method === 'POST' && url === '/users') {
        res.statusCode = 201;
        res.end(JSON.stringify({ id: 'u9', name: 'Created' }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address();
    if (typeof addr === 'string' || !addr) throw new Error('no addr');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 120000);

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it('round-trips list / get / create through the typed client with Zod-validated responses', async () => {
    // Vitest can't dynamically import .ts at runtime from a non-project path.
    // Spawn a tsx subprocess that imports the generated client and prints results as JSON.
    const runnerPath = join(tmpDir, 'run.mjs');
    await writeFile(
      runnerPath,
      `
      import { createClient } from './client.ts';
      const c = createClient({ baseUrl: ${JSON.stringify(baseUrl)} });
      const list = await c.users.listUsers();
      const one = await c.users.getUser({ id: 'u1' });
      const created = await c.users.createUser({ body: { id: 'u9', name: 'Created' } });
      const searched = await c.users.searchUsers({ q: 'alice', limit: 5, 'X-Request-Id': 'req-123' });
      console.log(JSON.stringify({ list, one, created, searched }));
    `,
      'utf8',
    );

    // Use async execFile (not execSync) — execSync blocks the Node event loop,
    // which would prevent the in-process http fixture server from serving the
    // child's requests, causing fetch to hang until undici's headers timeout.
    const { stdout } = await execFileP('pnpm', ['exec', 'tsx', 'run.mjs'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    const result = JSON.parse(stdout.trim());

    expect(Array.isArray(result.list)).toBe(true);
    expect(result.list[0].id).toBe('u1');
    expect(result.list[0].name).toBe('Alice');
    expect(result.list[1].id).toBe('u2');

    expect(result.one.id).toBe('u1');
    expect(result.one.name).toBe('Alice');

    expect(result.created.id).toBe('u9');
    expect(result.created.name).toBe('Created');

    expect(Array.isArray(result.searched)).toBe(true);
    expect(result.searched[0].name).toContain('q=/users/search?q=alice&limit=5');
    expect(result.searched[0].name).toContain('hdr=req-123');
  }, 30000);
});
