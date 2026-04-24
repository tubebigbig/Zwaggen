import { Endpoint, Spec, type BodyContentType } from '../schema/types';
import { substitute } from './substitute';
import { applyAuth } from './auth';
import { classifyError, ClassifiedError } from './classify-error';
import { getTransport, type Transport } from './transport';
import { getProxyUrl } from './proxyConfig';

export interface RunInputs {
  path: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface RunRequest {
  spec: Spec;
  endpoint: Endpoint;
  baseUrl: string;
  inputs: RunInputs;
  secrets: Record<string, string>;
  useProxy?: boolean;
  proxyUrl?: string; // defaults to getProxyUrl() (process-wide, default 'http://localhost:4801')
}

export interface RunResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawText?: string;
  latencyMs?: number;
  error?: ClassifiedError;
  missingVars: string[];
}

export interface BuiltRequest {
  method: string;
  url: string;           // absolute, post-substitution, with query applied
  headers: Record<string, string>;
  bodyText?: string;     // JSON.stringify of the body, OR a urlencoded form-string
  /**
   * Multipart body. Set when `endpoint.bodyContentType === 'multipart'`.
   * Mutually exclusive with `bodyText`. Transports prefer this over
   * `bodyText` when both are present.
   */
  bodyMultipart?: FormData;
  useProxy: boolean;     // effective (per-request override vs spec default)
  missingVars: string[]; // variables referenced but not defined in active env
}

function substituteInValue(v: unknown, sub: (s: string) => string): unknown {
  if (typeof v === 'string') return sub(v);
  if (Array.isArray(v)) return v.map((x) => substituteInValue(x, sub));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = substituteInValue(val, sub);
    return out;
  }
  return v;
}

function envVars(req: RunRequest): Record<string, string> {
  const env = req.spec.environments[req.spec.activeEnvironment] ?? { variables: [] };
  const out: Record<string, string> = {};
  for (const v of env.variables) {
    if (v.secret) {
      const s = req.secrets[v.name];
      if (s !== undefined) out[v.name] = s;
    } else {
      out[v.name] = v.value;
    }
  }
  return out;
}

export function buildRequest(req: RunRequest): BuiltRequest {
  const vars = envVars(req);
  const missing: string[] = [];
  const sub = (s: string): string => {
    const { text, missing: m } = substitute(s, vars);
    for (const x of m) if (!missing.includes(x)) missing.push(x);
    return text;
  };

  let path = req.endpoint.path;
  for (const [k, v] of Object.entries(req.inputs.path)) path = path.replaceAll(`{${k}}`, encodeURIComponent(v));
  const raw = sub(req.baseUrl + path);
  // Reject non-http(s) schemes outright. fetch() would reject most of these too,
  // but failing here gives a clear error and blocks file://, data:, javascript:, etc.
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error(`Refusing to request "${raw}" — only http:// and https:// URLs are allowed.`);
  }
  const url = new URL(raw);
  for (const [k, v] of Object.entries(req.inputs.query)) if (v !== '') url.searchParams.set(k, sub(v));

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.inputs.headers)) headers[k] = sub(v);

  const contentType: BodyContentType = req.endpoint.bodyContentType ?? 'json';
  let bodyText: string | undefined;
  let bodyMultipart: FormData | undefined;

  if (contentType === 'json') {
    if (req.endpoint.requestBody && req.inputs.body !== undefined) {
      bodyText = JSON.stringify(substituteInValue(req.inputs.body, sub));
      headers['content-type'] = 'application/json';
    }
  } else if (contentType === 'urlencoded') {
    if (req.inputs.body && typeof req.inputs.body === 'object') {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(req.inputs.body as Record<string, unknown>)) {
        if (v === undefined || v === null || v === '') continue;
        params.set(k, sub(String(v)));
      }
      bodyText = params.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
  } else if (contentType === 'multipart') {
    if (req.inputs.body && typeof req.inputs.body === 'object') {
      const fd = new FormData();
      for (const [k, v] of Object.entries(req.inputs.body as Record<string, unknown>)) {
        if (v === undefined || v === null || v === '') continue;
        // File preserves filename; bare Blob falls through to the default
        // ('blob' filename); plain values stringify and run through env
        // substitution.
        if (typeof File !== 'undefined' && v instanceof File) {
          fd.append(k, v, v.name);
        } else if (typeof Blob !== 'undefined' && v instanceof Blob) {
          fd.append(k, v);
        } else {
          fd.append(k, sub(String(v)));
        }
      }
      bodyMultipart = fd;
      // Intentionally NOT setting content-type — fetch supplies the boundary.
    }
  }

  const auth = req.endpoint.auth === 'inherit' ? req.spec.auth : req.endpoint.auth;
  const ctx = applyAuth({ headers, url }, auth);

  const useProxy =
    req.useProxy ?? (req.endpoint.useProxy === 'inherit' ? req.spec.useProxyDefault : req.endpoint.useProxy);

  return {
    method: req.endpoint.method,
    url: ctx.url.toString(),
    headers: ctx.headers,
    bodyText,
    bodyMultipart,
    useProxy,
    missingVars: missing,
  };
}

export async function sendRequest(
  req: RunRequest,
  opts?: { transport?: Transport },
): Promise<RunResult> {
  const built = buildRequest(req);
  const transport = opts?.transport ?? getTransport();

  let target = built.url;
  if (built.useProxy) {
    const proxy = req.proxyUrl ?? getProxyUrl();
    target = `${proxy}/proxy?url=${encodeURIComponent(built.url)}`;
  }

  const start = performance.now();
  try {
    const resp = await transport({
      method: built.method,
      url: target,
      headers: built.headers,
      bodyText: built.bodyText,
      bodyMultipart: built.bodyMultipart,
    });
    const latencyMs = Math.round(performance.now() - start);
    let body: unknown;
    try { body = JSON.parse(resp.rawText); } catch { body = undefined; }
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
      body,
      rawText: resp.rawText,
      latencyMs,
      missingVars: built.missingVars,
    };
  } catch (err) {
    return {
      ok: false,
      error: classifyError(err, { useProxy: built.useProxy }),
      latencyMs: Math.round(performance.now() - start),
      missingVars: built.missingVars,
    };
  }
}
