import http, { IncomingMessage, ServerResponse } from 'node:http';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'upgrade', 'proxy-authorization']);
const ALLOWED_PROXY_HOSTS = new Set(['api.example.com']);

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

function validateProxyTarget(target: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!ALLOWED_PROXY_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  if (parsed.username || parsed.password) return null;

  parsed.hash = '';
  return parsed.toString();
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/proxy') { res.statusCode = 404; res.end('Not found'); return; }
  const target = url.searchParams.get('url');
  if (!target) { res.statusCode = 400; res.end('Missing url query param'); return; }
  const safeTarget = validateProxyTarget(target);
  if (!safeTarget) { res.statusCode = 400; res.end('Invalid or disallowed target url'); return; }

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
      const upstream = await fetch(safeTarget, {
        method: req.method,
        headers: outgoingHeaders,
        body: body as any,
      });
      res.statusCode = upstream.status;
      upstream.headers.forEach((v, k) => {
        if (HOP_BY_HOP.has(k.toLowerCase())) return;
        res.setHeader(k, v);
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
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
