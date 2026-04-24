import http, { IncomingMessage, ServerResponse } from 'node:http';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'upgrade', 'proxy-authorization']);

// Node's `fetch` decompresses gzip/br/deflate automatically, so the bytes we
// re-emit are PLAIN regardless of what the upstream sent. We must strip
// content-encoding (and content-length, since the decompressed length differs)
// or browsers reject the response with `net::ERR_CONTENT_DECODING_FAILED`.
const STRIP_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length']);

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/proxy') { res.statusCode = 404; res.end('Not found'); return; }
  const target = url.searchParams.get('url');
  if (!target) { res.statusCode = 400; res.end('Missing url query param'); return; }

  const outgoingHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === 'host') continue;
    outgoingHeaders[k] = Array.isArray(v) ? v.join(',') : v;
  }

  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: outgoingHeaders,
        body: body as any,
      });
      res.statusCode = upstream.status;
      upstream.headers.forEach((v, k) => {
        const lower = k.toLowerCase();
        if (HOP_BY_HOP.has(lower)) return;
        if (STRIP_RESPONSE_HEADERS.has(lower)) return;
        res.setHeader(k, v);
      });
      // Accept-Encoding: identity on the upstream request would let us preserve
      // the original headers, but Node's fetch sets Accept-Encoding internally
      // and decompresses regardless. Always re-emit as identity.
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Length', String(buf.byteLength));
      res.end(buf);
    } catch (err) {
      res.statusCode = 502;
      res.end(`proxy error: ${(err as Error).message}`);
    }
  });
}

export function createServer() {
  return http.createServer(handle);
}
