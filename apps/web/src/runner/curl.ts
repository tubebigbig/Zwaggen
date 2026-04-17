import type { BuiltRequest } from './send';

export interface CurlOptions {
  secretMask?: Record<string, string>;
  proxyOn?: boolean;
}

export function toCurl(req: BuiltRequest, opts: CurlOptions = {}): string {
  const lines: string[] = [];
  lines.push(`curl -X ${req.method} ${q(req.url)}`);
  for (const [k, v] of Object.entries(req.headers)) {
    lines.push(`-H ${q(`${k}: ${v}`)}`);
  }
  if (req.bodyText !== undefined) {
    lines.push(`--data-raw ${q(req.bodyText)}`);
  }

  let cmd = lines.join(' \\\n  ');

  if (opts.secretMask) {
    for (const [raw, placeholder] of Object.entries(opts.secretMask)) {
      if (!raw) continue;
      cmd = cmd.split(raw).join(placeholder);
    }
  }

  if (opts.proxyOn) {
    cmd = `# Proxy mode is on in the app; this cURL hits the origin directly.\n${cmd}`;
  }

  return cmd;
}

function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
