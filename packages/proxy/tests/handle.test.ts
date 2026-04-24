import { afterEach, beforeEach, expect, test } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { handle } from '../src/server';

let upstream: http.Server;
let upstreamUrl: string;

beforeEach(async () => {
  upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, method: req.method }));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const addr = upstream.address() as AddressInfo;
  upstreamUrl = `http://127.0.0.1:${addr.port}/echo`;
});

afterEach(async () => {
  await new Promise<void>((r) => upstream.close(() => r()));
});

test('handle proxies a GET request to the target URL', async () => {
  const server = http.createServer(handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(upstreamUrl)}`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ ok: true, method: 'GET' });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('handle returns 400 when url query param is missing', async () => {
  const server = http.createServer(handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/proxy`);
    expect(r.status).toBe(400);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
