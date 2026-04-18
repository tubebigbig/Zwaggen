import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, '..', 'bin', 'zwag.js');

// spawnSync hangs on macOS + Node 24 when the child uses fetch() against a
// localhost server — undici's keep-alive agent holds the socket open and
// prevents spawnSync from collecting the child's stdio cleanly. Async spawn
// with explicit stdout 'close' hooks works reliably.
function runCli(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [cli, ...args], { stdio: ['inherit', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ status: code, stdout, stderr }));
  });
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('expected address info'));
        return;
      }
      resolve(addr.port);
    });
  });
}

describe('zwag run', () => {
  it('PASSes a 200 response and FAILs a 500 when expectedStatus is set', async () => {
    const server = createServer((req, res) => {
      if (req.url?.startsWith('/ok')) { res.writeHead(200); res.end('ok'); return; }
      res.writeHead(500); res.end('boom');
    });
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const spec = {
      schemaVersion: 1,
      info: { name: 'Test', baseUrl },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        {
          id: '1', method: 'GET', path: '/ok',
          pathParams: [], queryParams: [], headers: [],
          requestBody: null, responses: [],
          auth: 'inherit', useProxy: 'inherit',
          assertions: { expectedStatus: 200 },
        },
        {
          id: '2', method: 'GET', path: '/bad',
          pathParams: [], queryParams: [], headers: [],
          requestBody: null, responses: [],
          auth: 'inherit', useProxy: 'inherit',
          assertions: { expectedStatus: 200 },
        },
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'zwag-'));
    const specPath = join(dir, 'spec.json');
    writeFileSync(specPath, JSON.stringify(spec));

    const result = await runCli(['run', specPath]);
    server.close();

    expect(result.stdout).toMatch(/PASS GET \/ok/);
    expect(result.stdout).toMatch(/FAIL GET \/bad/);
    expect(result.stdout).toMatch(/1\/2 endpoints passed/);
    expect(result.status).toBe(1);
  });

  it('treats a completed request without assertions as PASS', async () => {
    const server = createServer((_req, res) => { res.writeHead(500); res.end('boom'); });
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const spec = {
      schemaVersion: 1,
      info: { name: 'Test', baseUrl },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        { id: '1', method: 'GET', path: '/x', pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit' },
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'zwag-'));
    const specPath = join(dir, 'spec.json');
    writeFileSync(specPath, JSON.stringify(spec));

    const result = await runCli(['run', specPath]);
    server.close();

    expect(result.stdout).toMatch(/PASS GET \/x — 500/);
    expect(result.stdout).toMatch(/1\/1 endpoints passed/);
    expect(result.status).toBe(0);
  });

  it('applies --filter to pick a subset', async () => {
    const server = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const spec = {
      schemaVersion: 1,
      info: { name: 'Test', baseUrl },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [
        { id: '1', method: 'GET', path: '/a', pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit' },
        { id: '2', method: 'GET', path: '/b', pathParams: [], queryParams: [], headers: [], requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit' },
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'zwag-'));
    const specPath = join(dir, 'spec.json');
    writeFileSync(specPath, JSON.stringify(spec));

    const result = await runCli(['run', specPath, '--filter', '^GET /a$']);
    server.close();

    expect(result.stdout).toMatch(/PASS GET \/a/);
    expect(result.stdout).not.toMatch(/\/b/);
    expect(result.stdout).toMatch(/1\/1 endpoints passed/);
    expect(result.status).toBe(0);
  });

  it('exits 2 when no base URL is available', async () => {
    const spec = {
      schemaVersion: 1,
      info: { name: 'Test' },
      types: {},
      environments: { default: { variables: [] } },
      activeEnvironment: 'default',
      auth: { type: 'none' },
      useProxyDefault: false,
      endpoints: [],
    };
    const dir = mkdtempSync(join(tmpdir(), 'zwag-'));
    const specPath = join(dir, 'spec.json');
    writeFileSync(specPath, JSON.stringify(spec));

    const result = await runCli(['run', specPath]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/no base URL/);
  });
});
