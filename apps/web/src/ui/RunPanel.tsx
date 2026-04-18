import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { sendRequest, buildRequest, type RunResult } from '../runner/send';
import { toCurl } from '../runner/curl';
import { validate, type ValidationError } from '../validator/validate';
import { substitute } from '../runner/substitute';
import { loadSecrets } from '../storage/drafts';
import { pushHistory, trimResult, type HistoryEntry } from '../storage/history';
import { ResponseView } from './ResponseView';
import { HistoryDrawer } from './HistoryDrawer';
import { IconAlert, IconCheck, IconClipboard, IconSend, IconX } from './icons';
import type { Spec } from '../schema/types';
import { resolveExample } from '../schema/resolveExample';
import { evaluateAssertions, type AssertionResult } from '../runner/assertions';

function secretMaskFor(spec: Spec, secrets: Record<string, string>): Record<string, string> {
  const env = spec.environments[spec.activeEnvironment];
  if (!env) return {};
  const out: Record<string, string> = {};
  for (const v of env.variables) {
    if (!v.secret) continue;
    const raw = secrets[v.name] ?? v.value;
    // Shell variable names only allow [A-Z0-9_]; normalize anything else to '_'.
    if (raw) out[raw] = '$' + v.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }
  return out;
}

export function RunPanel() {
  const { t } = useTranslation();
  const { spec, selectedEndpointId } = useSpecStore();
  const endpoint = spec.endpoints.find((e) => e.id === selectedEndpointId);
  const [baseUrl, setBaseUrl] = useState(spec.info.baseUrl ?? '');
  const secretsSnapshot = useRef<Record<string, string>>({});

  useEffect(() => {
    setBaseUrl(spec.info.baseUrl ?? '');
  }, [spec.info.baseUrl]);

  useEffect(() => {
    let alive = true;
    void loadSecrets().then((store) => {
      if (alive) secretsSnapshot.current = store[spec.activeEnvironment] ?? {};
    });
    return () => { alive = false; };
  }, [spec.activeEnvironment]);
  const [pathVals, setPathVals] = useState<Record<string, string>>({});
  const [queryVals, setQueryVals] = useState<Record<string, string>>({});
  const [headerVals, setHeaderVals] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState<string>('{}');
  const [useProxy, setUseProxy] = useState<boolean | undefined>(undefined);
  const [historyEpoch, setHistoryEpoch] = useState<number>(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ res: RunResult; validationErrors: ValidationError[]; note?: string; assertionResults: AssertionResult[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [curlFallback, setCurlFallback] = useState<string | null>(null);

  if (!endpoint) return null;

  const seedable = endpoint.requestBody ? resolveExample(spec, endpoint.requestBody) : undefined;

  function seedBody() {
    if (seedable === undefined) return;
    setBodyText(JSON.stringify(seedable, null, 2));
  }

  function collectMissingVars(): string[] {
    const env = spec.environments[spec.activeEnvironment];
    const known: Record<string, string> = {};
    if (env) {
      for (const v of env.variables) {
        if (v.secret) {
          if (v.value) known[v.name] = v.value;
          else if (secretsSnapshot.current[v.name]) known[v.name] = secretsSnapshot.current[v.name]!;
        } else {
          known[v.name] = v.value;
        }
      }
    }
    const inputs = [
      baseUrl, endpoint!.path,
      ...Object.values(queryVals), ...Object.values(headerVals),
      endpoint!.requestBody ? bodyText : '',
    ];
    const missing = new Set<string>();
    for (const s of inputs) for (const m of substitute(s, known).missing) missing.add(m);
    return [...missing];
  }

  async function onCopyCurl() {
    const missingVars = collectMissingVars();
    if (missingVars.length > 0) {
      const go = confirm(
        `Undefined variable(s): ${missingVars.join(', ')}\n\nCopy anyway? The command will contain literal '{{name}}'.`,
      );
      if (!go) return;
    }

    const secretStore = await loadSecrets();
    const secrets = secretStore[spec.activeEnvironment] ?? {};

    let body: unknown = undefined;
    if (endpoint!.requestBody) {
      try { body = JSON.parse(bodyText); }
      catch {
        setCurlFallback(null);
        alert('Request body is not valid JSON — fix it before copying.');
        return;
      }
    }

    const built = buildRequest({
      spec, endpoint: endpoint!, baseUrl,
      inputs: { path: pathVals, query: queryVals, headers: headerVals, body },
      secrets,
      useProxy,
    });

    const cmd = toCurl(built, {
      secretMask: secretMaskFor(spec, secrets),
      proxyOn: built.useProxy,
    });

    try {
      await navigator.clipboard.writeText(cmd);
      setCurlFallback(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCurlFallback(cmd);
    }
  }

  async function onSend() {
    const missingVars = collectMissingVars();
    if (missingVars.length > 0) {
      const go = confirm(
        `Undefined variable(s): ${missingVars.join(', ')}\n\nSending anyway will leave literal '{{name}}' in the request. Continue?`,
      );
      if (!go) return;
    }

    setSending(true);
    try {
      const secretStore = await loadSecrets();
      const secrets = secretStore[spec.activeEnvironment] ?? {};
      const activeEnvVars = spec.environments[spec.activeEnvironment]?.variables ?? [];
      const missingSecrets = activeEnvVars.filter((v) => v.secret && !v.value && !secrets[v.name]);
      if (missingSecrets.length) {
        return setResult({ res: { ok: false, missingVars: [], error: { kind: 'other', hint: `Missing secrets: ${missingSecrets.map((s) => s.name).join(', ')}. Fill them in the Env panel before sending.`, message: '' } }, validationErrors: [], assertionResults: [] });
      }
      let body: unknown = undefined;
      if (endpoint!.requestBody) {
        try { body = JSON.parse(bodyText); }
        catch { return setResult({ res: { ok: false, missingVars: [], error: { kind: 'other', hint: 'Bad JSON', message: 'Request body is not valid JSON' } }, validationErrors: [], assertionResults: [] }); }
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
      const assertionResults = evaluateAssertions(res, endpoint!.assertions);
      setResult({ res, validationErrors, note, assertionResults });
      await pushHistory({
        id: crypto.randomUUID(),
        at: Date.now(),
        endpointId: endpoint!.id,
        inputs: { path: pathVals, query: queryVals, headers: headerVals, body },
        baseUrlUsed: baseUrl,
        useProxyUsed:
          (useProxy ?? (endpoint!.useProxy === 'inherit' ? spec.useProxyDefault : endpoint!.useProxy)) === true,
        result: trimResult(res, validationErrors),
      });
      setHistoryEpoch((n) => n + 1);
    } finally {
      setSending(false);
    }
  }

  function onReplay(e: HistoryEntry) {
    setPathVals(e.inputs.path);
    setQueryVals(e.inputs.query);
    setHeaderVals(e.inputs.headers);
    setBodyText(e.inputs.body !== undefined ? JSON.stringify(e.inputs.body, null, 2) : '{}');
    setBaseUrl(e.baseUrlUsed);
    setUseProxy(e.useProxyUsed);
  }

  return (
    <section className="card p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="panel-title">{t('tryIt')}</h3>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 min-w-[200px]">
          <span className="text-xs text-slate-500">{t('baseUrl')}</span>
          <input
            aria-label="Base URL"
            className="input mt-1 font-mono text-xs"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">
          <input
            aria-label="Use proxy"
            type="checkbox"
            checked={useProxy ?? (endpoint.useProxy === 'inherit' ? spec.useProxyDefault : endpoint.useProxy)}
            onChange={(e) => setUseProxy(e.target.checked)}
          />
          {t('useProxy')}
        </label>
        <button
          className="btn-primary"
          disabled={sending}
          onClick={() => void onSend()}
        >
          <IconSend />
          {sending ? t('sending') : t('send')}
        </button>
        <button
          className="btn"
          onClick={() => void onCopyCurl()}
          title={t('copyAsCurl')}
        >
          <IconClipboard />
          {copied ? t('copied') : t('copyAsCurl')}
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {endpoint.pathParams.length > 0 && (
          <ParamInputs label={t('path')} params={endpoint.pathParams} values={pathVals} onChange={setPathVals} />
        )}
        {endpoint.queryParams.length > 0 && (
          <ParamInputs label={t('query')} params={endpoint.queryParams} values={queryVals} onChange={setQueryVals} />
        )}
        {endpoint.headers.length > 0 && (
          <ParamInputs label={t('headers')} params={endpoint.headers} values={headerVals} onChange={setHeaderVals} />
        )}
        {endpoint.requestBody && (
          <div className="block">
            <div className="flex items-center justify-between">
              <label htmlFor="run-body" className="text-xs text-slate-500">{t('body')}</label>
              <button
                type="button"
                className="btn text-xs"
                disabled={seedable === undefined}
                onClick={seedBody}
              >
                {t('seedFromExample')}
              </button>
            </div>
            <textarea
              id="run-body"
              aria-label="Body"
              className="input mt-1 font-mono text-xs"
              rows={5}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
          </div>
        )}
      </div>
      {curlFallback && (
        <div role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <div className="mb-1">Copy failed — select the command below and press {/Mac|iPhone|iPod|iPad/.test(navigator.userAgent) ? '⌘C' : 'Ctrl+C'}.</div>
          <textarea
            readOnly
            autoFocus
            className="input w-full font-mono text-[11px]"
            rows={Math.min(8, curlFallback.split('\n').length)}
            value={curlFallback}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
      {result && <RunResultView result={result} />}
      <HistoryDrawer endpointId={endpoint.id} epoch={historyEpoch} onReplay={onReplay} />
    </section>
  );
}

function ParamInputs({ label, params, values, onChange }: {
  label: string; params: { name: string; required: boolean }[];
  values: Record<string, string>; onChange(v: Record<string, string>): void;
}) {
  return (
    <fieldset className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
      <legend className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {params.map((p) => (
          <label key={p.name} className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-slate-600">
              {p.name}
              {p.required && <span className="ml-0.5 text-red-500">*</span>}
            </span>
            <input
              aria-label={`${label}:${p.name}`}
              className="input w-32 font-mono text-xs"
              value={values[p.name] ?? ''}
              onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RunResultView({ result }: { result: { res: RunResult; validationErrors: { path: string; message: string }[]; note?: string; assertionResults: AssertionResult[] } }) {
  const { t } = useTranslation();
  const { res, validationErrors, note, assertionResults } = result;
  if (res.error) {
    return (
      <div role="alert" className="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-red-700">
        <IconX className="mt-0.5 flex-shrink-0 text-red-600" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide">{res.error.kind}</div>
          <div className="text-sm">{res.error.hint}</div>
          {res.error.kind === 'other' && 'message' in res.error && (
            <div className="mt-0.5 text-xs text-red-600/80">{res.error.message}</div>
          )}
        </div>
      </div>
    );
  }
  if (res.missingVars.length > 0) {
    return (
      <div role="alert" className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
        <IconAlert className="mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-semibold">{t('undefinedVariables')}</span>{' '}
          <span className="font-mono text-xs">{res.missingVars.join(', ')}</span>.
          Define them or fix the reference, then resend.
        </div>
      </div>
    );
  }
  const anyAssertionFailed = assertionResults.some((a) => !a.passed);
  const passed = validationErrors.length === 0 && !note && !anyAssertionFailed;
  const okish = passed;
  const status = res.status ?? 0;
  const statusColor =
    status >= 500 ? 'bg-red-100 text-red-700' :
    status >= 400 ? 'bg-amber-100 text-amber-800' :
    status >= 300 ? 'bg-blue-100 text-blue-700' :
    status >= 200 ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700';

  return (
    <div className={`mt-3 rounded-md border p-2.5 ${okish ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className={`chip ${statusColor}`}>{res.status} {res.statusText}</span>
        <span className="chip bg-slate-100 text-slate-700">{res.latencyMs} {t('ms')}</span>
        <span className={`chip ${passed ? 'bg-emerald-100 text-emerald-700' : validationErrors.length ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
          {passed ? <><IconCheck width={12} height={12} /> type ok</> : validationErrors.length ? <><IconX width={12} height={12} /> {validationErrors.length} type errors</> : 'no type declared'}
        </span>
        {assertionResults.map((a, i) => (
          <span
            key={i}
            className={`chip ${a.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
            title={a.message}
          >
            {a.kind === 'status' ? '#' : a.kind === 'latency' ? '⏱' : '📋'}
            {' '}
            {a.passed ? '✓' : '✗'}
          </span>
        ))}
      </div>
      {note && <div className="mb-1 text-xs text-amber-800">{note}</div>}
      {res.body !== undefined && (
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <ResponseView body={res.body} errors={validationErrors} />
        </div>
      )}
    </div>
  );
}
