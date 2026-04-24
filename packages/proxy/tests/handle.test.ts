import { afterEach, beforeEach, expect, test } from 'vitest';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
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

test('handle strips upstream Content-Encoding (prevents ERR_CONTENT_DECODING_FAILED)', async () => {
  // Upstream replies with gzip-encoded bytes + Content-Encoding: gzip.
  // Node's fetch decompresses transparently, so the proxy's buffered bytes
  // are PLAIN. If we forwarded the Content-Encoding header, browsers would
  // try to gunzip already-plain bytes and fail.
  await new Promise<void>((r) => upstream.close(() => r()));
  const payload = JSON.stringify({ ok: true, big: 'x'.repeat(1024) });
  const gzipped = gzipSync(Buffer.from(payload));
  upstream = http.createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'content-length': String(gzipped.byteLength),
    });
    res.end(gzipped);
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const addr = upstream.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}/echo`;

  const server = http.createServer(handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(url)}`);
    expect(r.status).toBe(200);
    // Proxy must NOT forward content-encoding (we emit plain bytes).
    expect(r.headers.get('content-encoding')).toBeNull();
    // Content-Length, if present, matches the plain length (not the gzip length).
    const cl = r.headers.get('content-length');
    if (cl !== null) expect(parseInt(cl, 10)).toBe(payload.length);
    expect(await r.text()).toBe(payload);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
