import { useState } from 'react';
import { useSpecStore } from '../state/store';
import { sendRequest, type RunResult } from '../runner/send';
import { validate, type ValidationError } from '../validator/validate';
import { substitute } from '../runner/substitute';
import { loadSecrets } from '../storage/drafts';
import { ResponseView } from './ResponseView';

export function RunPanel() {
  const { spec, selectedEndpointId } = useSpecStore();
  const endpoint = spec.endpoints.find((e) => e.id === selectedEndpointId);
  const [baseUrl, setBaseUrl] = useState('{{base}}');
  const [pathVals, setPathVals] = useState<Record<string, string>>({});
  const [queryVals, setQueryVals] = useState<Record<string, string>>({});
  const [headerVals, setHeaderVals] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState<string>('{}');
  const [useProxy, setUseProxy] = useState<boolean | undefined>(undefined);
  const [result, setResult] = useState<{ res: RunResult; validationErrors: ValidationError[]; note?: string } | null>(null);

  if (!endpoint) return null;

  function collectMissingVars(): string[] {
    const env = spec.environments[spec.activeEnvironment];
    const known: Record<string, string> = {};
    if (env) for (const v of env.variables) if (!v.secret) known[v.name] = v.value;
    const inputs = [
      baseUrl, endpoint!.path,
      ...Object.values(queryVals), ...Object.values(headerVals),
      endpoint!.requestBody ? bodyText : '',
    ];
    const missing = new Set<string>();
    for (const s of inputs) for (const m of substitute(s, known).missing) missing.add(m);
    return [...missing];
  }

  async function onSend() {
    const missingVars = collectMissingVars();
    if (missingVars.length > 0) {
      const go = confirm(
        `Undefined variable(s): ${missingVars.join(', ')}\n\nSending anyway will leave literal '{{name}}' in the request. Continue?`,
      );
      if (!go) return;
    }

    const secretStore = await loadSecrets();
    const secrets = secretStore[spec.activeEnvironment] ?? {};
    let body: unknown = undefined;
    if (endpoint!.requestBody) {
      try { body = JSON.parse(bodyText); }
      catch { return setResult({ res: { ok: false, missingVars: [], error: { kind: 'other', hint: 'Bad JSON', message: 'Request body is not valid JSON' } }, validationErrors: [] }); }
    }
    const res = await sendRequest({
      spec, endpoint: endpoint!, baseUrl,
      inputs: { path: pathVals, query: queryVals, headers: headerVals, body },
      secrets,
      useProxy,
    });
    let validationErrors: ValidationError[] = [];
    let note: string | undefined;
    if (res.status != null) {
      const match = endpoint!.responses.find((r) => r.status === res.status);
      if (!match) note = `No response type declared for status ${res.status}.`;
      else if (res.body !== undefined) validationErrors = validate(spec, match.type, res.body);
    }
    setResult({ res, validationErrors, note });
  }

  return (
    <section className="border-t p-4 space-y-2 text-sm">
      <div className="flex gap-2">
        <label className="flex-1">Base URL
          <input
            aria-label="Base URL"
            className="ml-1 border rounded px-1 w-full"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          <input
            aria-label="Use proxy"
            type="checkbox"
            checked={useProxy ?? (endpoint.useProxy === 'inherit' ? spec.useProxyDefault : endpoint.useProxy)}
            onChange={(e) => setUseProxy(e.target.checked)}
          /> use proxy
        </label>
        <button className="rounded bg-slate-900 text-white px-3 py-1" onClick={() => void onSend()}>Send</button>
      </div>
      {endpoint.pathParams.length > 0 && (
        <ParamInputs label="Path" params={endpoint.pathParams} values={pathVals} onChange={setPathVals} />
      )}
      {endpoint.queryParams.length > 0 && (
        <ParamInputs label="Query" params={endpoint.queryParams} values={queryVals} onChange={setQueryVals} />
      )}
      {endpoint.headers.length > 0 && (
        <ParamInputs label="Headers" params={endpoint.headers} values={headerVals} onChange={setHeaderVals} />
      )}
      {endpoint.requestBody && (
        <label className="block">Body
          <textarea
            aria-label="Body"
            className="w-full border rounded px-1 font-mono"
            rows={5}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </label>
      )}
      {result && <RunResultView result={result} />}
    </section>
  );
}

function ParamInputs({ label, params, values, onChange }: {
  label: string; params: { name: string; required: boolean }[];
  values: Record<string, string>; onChange(v: Record<string, string>): void;
}) {
  return (
    <fieldset className="border rounded p-2">
      <legend>{label}</legend>
      {params.map((p) => (
        <label key={p.name} className="mr-2 inline-flex items-center gap-1">
          <span>{p.name}{p.required ? '*' : ''}</span>
          <input
            aria-label={`${label}:${p.name}`}
            className="border rounded px-1"
            value={values[p.name] ?? ''}
            onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}

function RunResultView({ result }: { result: { res: RunResult; validationErrors: { path: string; message: string }[]; note?: string } }) {
  const { res, validationErrors, note } = result;
  if (res.error) {
    return (
      <div role="alert" className="rounded bg-red-50 p-2 text-red-700">
        <div className="font-semibold">{res.error.kind}</div>
        <div>{res.error.hint}</div>
        {res.error.kind === 'other' && 'message' in res.error && <div className="text-xs">{res.error.message}</div>}
      </div>
    );
  }
  if (res.missingVars.length > 0) {
    return <div role="alert" className="rounded bg-amber-50 p-2 text-amber-800">Undefined variables: {res.missingVars.join(', ')}. Define them or fix the reference, then resend.</div>;
  }
  const passed = validationErrors.length === 0 && !note;
  return (
    <div className={`rounded p-2 ${passed ? 'bg-green-50' : 'bg-amber-50'}`}>
      <div className="flex gap-4 text-xs">
        <span>Status: {res.status} {res.statusText}</span>
        <span>{res.latencyMs} ms</span>
        <span>{passed ? '✓ type ok' : validationErrors.length ? `✗ ${validationErrors.length} type errors` : 'no type declared'}</span>
      </div>
      {note && <div className="mt-1 text-xs text-amber-800">{note}</div>}
      {res.body !== undefined && (
        <ResponseView body={res.body} errors={validationErrors} />
      )}
    </div>
  );
}
