import { describe, expect, test } from 'vitest';
import { createServer } from '../src/server';
import { once } from 'node:events';
import http from 'node:http';

async function startUpstream() {
  const u = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, cookie: req.headers.cookie ?? null }));
  });
  u.listen(0);
  await once(u, 'listening');
  return u;
}

describe('proxy', () => {
  test('forwards request and includes Cookie header', async () => {
    const upstream = await startUpstream();
    const { port: upPort } = upstream.address() as { port: number };
    const server = createServer();
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as { port: number };

    const res = await fetch(`http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(`http://127.0.0.1:${upPort}/x`)}`, {
      headers: { cookie: 'a=1' },
    });
    const body = await res.json();
    expect(body.path).toBe('/x');
    expect(body.cookie).toBe('a=1');

    server.close(); upstream.close();
  });

  test('rejects missing url', async () => {
    const server = createServer();
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/proxy`);
    expect(res.status).toBe(400);
    server.close();
  });
});
