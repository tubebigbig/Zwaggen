import { Endpoint, Spec } from '../schema/types';
import { substitute } from './substitute';
import { applyAuth } from './auth';
import { classifyError, ClassifiedError } from './classify-error';

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
  proxyUrl?: string; // defaults to http://localhost:4801
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

export async function sendRequest(req: RunRequest): Promise<RunResult> {
  const vars = envVars(req);
  const missing: string[] = [];
  const sub = (s: string): string => {
    const { text, missing: m } = substitute(s, vars);
    for (const x of m) if (!missing.includes(x)) missing.push(x);
    return text;
  };

  let path = req.endpoint.path;
  for (const [k, v] of Object.entries(req.inputs.path)) path = path.replaceAll(`{${k}}`, encodeURIComponent(v));
  const url = new URL(sub(req.baseUrl + path));
  for (const [k, v] of Object.entries(req.inputs.query)) if (v !== '') url.searchParams.set(k, sub(v));

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.inputs.headers)) headers[k] = sub(v);
  if (req.endpoint.requestBody) headers['content-type'] = 'application/json';

  const auth = req.endpoint.auth === 'inherit' ? req.spec.auth : req.endpoint.auth;
  const ctx = applyAuth({ headers, url }, auth);

  let target = ctx.url.toString();
  const useProxy = req.useProxy ?? (req.endpoint.useProxy === 'inherit' ? req.spec.useProxyDefault : req.endpoint.useProxy);
  if (useProxy) {
    const proxy = req.proxyUrl ?? 'http://localhost:4801';
    target = `${proxy}/proxy?url=${encodeURIComponent(ctx.url.toString())}`;
  }

  const bodyText = req.endpoint.requestBody && req.inputs.body !== undefined
    ? JSON.stringify(substituteInValue(req.inputs.body, sub))
    : undefined;

  const start = performance.now();
  try {
    const resp = await fetch(target, {
      method: req.endpoint.method,
      headers: ctx.headers,
      body: bodyText,
    });
    const rawText = await resp.text();
    const latencyMs = Math.round(performance.now() - start);
    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => { respHeaders[k] = v; });
    let body: unknown;
    try { body = JSON.parse(rawText); } catch { body = undefined; }
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
      body,
      rawText,
      latencyMs,
      missingVars: missing,
    };
  } catch (err) {
    return { ok: false, error: classifyError(err, { useProxy: !!useProxy }), latencyMs: Math.round(performance.now() - start), missingVars: missing };
  }
}
