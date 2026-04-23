import { createServer, Server } from 'node:http';

export interface Stub {
  url: string;
  close(): Promise<void>;
}

/**
 * Tiny localhost echo server used to prove CORS bypass: the renderer never
 * could have hit this URL directly (browser CORS would block a cross-origin
 * fetch from a `file://` page), so a successful response from inside Electron
 * is positive proof that traffic is going through the IPC + Node fetch path.
 */
export async function startStub(): Promise<Stub> {
  const server: Server = createServer((req, res) => {
    if (req.url === '/echo') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('bad address');
  const url = `http://127.0.0.1:${addr.port}`;
  return {
    url,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}
