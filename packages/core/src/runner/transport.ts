/** Final, post-substitution HTTP request handed to a {@link Transport}. */
export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
}

/** Response shape a {@link Transport} returns. Repeated headers (e.g. Set-Cookie) are flattened — last value wins. */
export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawText: string;
}

/**
 * Pluggable HTTP transport used by `sendRequest`. Implement this to route
 * requests through a non-fetch path — e.g. an Electron renderer can implement
 * `async (req) => ipc.invoke('http', req)` so the Node main process performs
 * the request and bypasses browser CORS.
 */
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

/** Default transport — wraps `globalThis.fetch`. Used when `sendRequest` is called without a custom transport. */
export const fetchTransport: Transport = async (req) => {
  const resp = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.bodyText,
  });
  const rawText = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });
  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
    headers,
    rawText,
  };
};
