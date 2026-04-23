import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import {
  sendRequest,
  buildRequest,
  toCurl,
  substitute,
  resolveExample,
  evaluateAssertions,
  applyCaptures,
  type RunResult,
  type Spec,
  type AssertionResult,
  type CaptureResult,
} from '@zwaggen/core';
import { validate, type ValidationError } from '../validator/validate';
import { loadSecrets, saveSecrets } from '../storage/drafts';
import { pushHistory, trimResult, type HistoryEntry } from '../storage/history';
import { ResponseView } from './ResponseView';
import { HistoryDrawer } from './HistoryDrawer';
import { IconAlert, IconCheck, IconClipboard, IconSend, IconX } from './icons';
import { IS_PLAYGROUND } from '../config';

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
  const { spec, setSpec, selectedEndpointId } = useSpecStore();
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
  // Per-field value: plain string for text/url-encoded fields, or File for
  // multipart file fields. Runner accepts both directly (see core/send.ts).
  const [bodyFormVals, setBodyFormVals] = useState<Record<string, string | File>>({});
  const [useProxyState, setUseProxy] = useState<boolean | undefined>(undefined);
  // In the hosted playground we never route through a proxy, regardless of
  // what the loaded spec sets or what the user toggled.
  const useProxy = IS_PLAYGROUND ? false : useProxyState;
  const [historyEpoch, setHistoryEpoch] = useState<number>(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ res: RunResult; validationErrors: ValidationError[]; note?: string; assertionResults: AssertionResult[]; captureResults?: CaptureResult[] } | null>(null);
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
    const ct = endpoint!.bodyContentType ?? 'json';
    // File-typed fields can't contain {{vars}}; skip them when scanning
    // for missing-variable references.
    const formStringValues = (ct === 'urlencoded' || ct === 'multipart')
      ? Object.values(bodyFormVals).filter((v): v is string => typeof v === 'string')
      : [];
    const inputs = [
      baseUrl, endpoint!.path,
      ...Object.values(queryVals), ...Object.values(headerVals),
      ct === 'json' && endpoint!.requestBody ? bodyText : '',
      ...formStringValues,
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
    const ct = endpoint!.bodyContentType ?? 'json';
    if (ct === 'json' && endpoint!.requestBody) {
      try { body = JSON.parse(bodyText); }
      catch {
        setCurlFallback(null);
        alert('Request body is not valid JSON — fix it before copying.');
        return;
      }
    } else if ((ct === 'urlencoded' || ct === 'multipart') && (endpoint!.bodyForm?.length ?? 0) > 0) {
      body = bodyFormVals;
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
      const ct = endpoint!.bodyContentType ?? 'json';
      if (ct === 'json' && endpoint!.requestBody) {
        try { body = JSON.parse(bodyText); }
        catch { return setResult({ res: { ok: false, missingVars: [], error: { kind: 'other', hint: 'Bad JSON', message: 'Request body is not valid JSON' } }, validationErrors: [], assertionResults: [] }); }
      } else if ((ct === 'urlencoded' || ct === 'multipart') && (endpoint!.bodyForm?.length ?? 0) > 0) {
        body = bodyFormVals;
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
      if (res.ok) {
        const { results, specPatch, secretsPatch } = applyCaptures(spec, endpoint!.captures, res.body);
        if (specPatch) await setSpec(specPatch);
        if (secretsPatch) {
          const existing = await loadSecrets();
          await saveSecrets({
            ...existing,
            [spec.activeEnvironment]: { ...(existing[spec.activeEnvironment] ?? {}), ...secretsPatch },
          });
        }
        if (results.length > 0) {
          setResult((prev) => prev ? { ...prev, captureResults: results } : prev);
        }
      }
      // History entries may live for weeks in IndexedDB; never persist raw
      // file bytes. Replace each File value with a small placeholder marker
      // so replay can show "(file: name.ext)" without bloating storage.
      let historyBody: unknown = body;
      if (body && typeof body === 'object' && !(body instanceof Blob)) {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
          cleaned[k] = (typeof File !== 'undefined' && v instanceof File)
            ? `[file: ${v.name}]`
            : v;
        }
        historyBody = cleaned;
      }
      await pushHistory({
        id: crypto.randomUUID(),
        at: Date.now(),
        endpointId: endpoint!.id,
        inputs: { path: pathVals, query: queryVals, headers: headerVals, body: historyBody },
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
    const ct = endpoint!.bodyContentType ?? 'json';
    if ((ct === 'urlencoded' || ct === 'multipart') && e.inputs.body && typeof e.inputs.body === 'object') {
      // For form bodies, history stored a string-keyed object — restore it.
      // File entries can't be replayed (we don't persist bytes in history yet),
      // so we drop them and the user re-picks before re-sending.
      const obj = e.inputs.body as Record<string, unknown>;
      const restored: Record<string, string | File> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v == null) restored[k] = '';
        else if (typeof File !== 'undefined' && v instanceof File) continue;
        else restored[k] = String(v);
      }
      setBodyFormVals(restored);
    } else {
      setBodyText(e.inputs.body !== undefined ? JSON.stringify(e.inputs.body, null, 2) : '{}');
    }
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
        {!IS_PLAYGROUND && (
          <label className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">
            <input
              aria-label="Use proxy"
              type="checkbox"
              checked={useProxy ?? (endpoint.useProxy === 'inherit' ? spec.useProxyDefault : endpoint.useProxy)}
              onChange={(e) => setUseProxy(e.target.checked)}
            />
            {t('useProxy')}
          </label>
        )}
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
        {(endpoint.bodyContentType ?? 'json') === 'json' && endpoint.requestBody && (
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
        {(endpoint.bodyContentType === 'urlencoded' || endpoint.bodyContentType === 'multipart') && (endpoint.bodyForm?.length ?? 0) > 0 && (
          <BodyFormInputs
            label={t('formFields')}
            params={endpoint.bodyForm!}
            values={bodyFormVals}
            onChange={setBodyFormVals}
            multipart={endpoint.bodyContentType === 'multipart'}
          />
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

/**
 * Body-form renderer used for both `urlencoded` and `multipart` content
 * types. Each ParamDef row renders a `<input type="file">` when its
 * `type.kind === 'file'` and the endpoint is multipart; otherwise a plain
 * text input. File values land in the values record as-is — the runner
 * (`packages/core/src/runner/send.ts`) appends them straight into FormData.
 */
function BodyFormInputs({
  label,
  params,
  values,
  onChange,
  multipart,
}: {
  label: string;
  params: { name: string; required: boolean; type: { kind: string; accept?: string } }[];
  values: Record<string, string | File>;
  onChange(v: Record<string, string | File>): void;
  multipart: boolean;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
      <legend className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</legend>
      <div className="flex flex-col gap-2">
        {params.map((p) => {
          const isFileField = multipart && p.type.kind === 'file';
          const current = values[p.name];
          if (isFileField) {
            const file = current instanceof File ? current : null;
            return (
              <div key={p.name} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-mono text-slate-600">
                  {p.name}
                  {p.required && <span className="ml-0.5 text-red-500">*</span>}
                </span>
                <input
                  aria-label={`${label}:${p.name}`}
                  type="file"
                  accept={p.type.accept}
                  className="text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) {
                      onChange({ ...values, [p.name]: f });
                    } else {
                      const { [p.name]: _drop, ...rest } = values;
                      onChange(rest);
                    }
                  }}
                />
                {file ? (
                  <>
                    <span className="text-[11px] text-slate-500">
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-slate-400 hover:text-red-600"
                      onClick={() => {
                        const { [p.name]: _drop, ...rest } = values;
                        onChange(rest);
                      }}
                    >
                      {t('fileClear')}
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-400">{t('fileNone')}</span>
                )}
              </div>
            );
          }
          const stringVal = typeof current === 'string' ? current : '';
          return (
            <label key={p.name} className="flex items-center gap-1.5 text-xs">
              <span className="font-mono text-slate-600">
                {p.name}
                {p.required && <span className="ml-0.5 text-red-500">*</span>}
              </span>
              <input
                aria-label={`${label}:${p.name}`}
                className="input w-32 font-mono text-xs"
                value={stringVal}
                onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s;

function RunResultView({ result }: { result: { res: RunResult; validationErrors: { path: string; message: string }[]; note?: string; assertionResults: AssertionResult[]; captureResults?: CaptureResult[] } }) {
  const { t } = useTranslation();
  const { res, validationErrors, note, assertionResults, captureResults } = result;
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
      {captureResults && captureResults.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs">
          {captureResults.map((c, i) => (
            <div key={i}>
              {c.found ? (
                <span className="text-emerald-700">
                  {c.capture.setVar} ← {c.capture.path} = <code className="rounded bg-emerald-50 px-1">{truncate(c.value!, 40)}</code>
                </span>
              ) : (
                <span className="text-amber-700">
                  {c.capture.setVar}: {c.warning ?? 'path not found'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {note && <div className="mb-1 text-xs text-amber-800">{note}</div>}
      {res.body !== undefined && (
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <ResponseView body={res.body} errors={validationErrors} />
        </div>
      )}
    </div>
  );
}
