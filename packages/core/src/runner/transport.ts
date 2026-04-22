export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawText: string;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

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
