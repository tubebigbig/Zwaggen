import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Spec } from '../schema/types';
import { runAll, type BatchRow } from '../runner/batch';
import { IconX, IconCheck, IconAlert } from './icons';
import { MethodBadge } from './MethodBadge';

interface Props {
  spec: Spec;
  onClose: () => void;
}

export function BatchRunPanel({ spec, onClose }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BatchRow[]>(() =>
    spec.endpoints.map((e) => ({
      endpointId: e.id,
      method: e.method,
      path: e.path,
      status: 'pending' as const,
    }))
  );
  const handleRef = useRef<{ cancel: () => void; done: Promise<void> } | null>(null);
  const [running, setRunning] = useState(false);

  function start() {
    setRows((prev) => prev.map((r) => ({ ...r, status: 'pending' })));
    setRunning(true);
    const h = runAll(spec, undefined, (row) => {
      setRows((prev) => prev.map((r) => r.endpointId === row.endpointId ? row : r));
    });
    handleRef.current = h;
    void h.done.finally(() => {
      setRunning(false);
      handleRef.current = null;
    });
  }

  function stop() {
    handleRef.current?.cancel();
  }

  useEffect(() => {
    start();
    return () => handleRef.current?.cancel();
  }, []); // start immediately on mount; if re-run needed, re-mount the panel

  const done = rows.filter((r) => r.status === 'done' || r.status === 'errored');
  const passed = done.filter((r) => r.passed === true).length;
  const total = done.length;

  return (
    <div
      role="dialog"
      aria-label={t('runAll')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold">
            {t('runAll')}
            {total > 0 && (
              <span className="ml-2 text-slate-500">
                · {t('runAllSummary', { passed, total })}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1">
            {running ? (
              <button className="btn" onClick={stop}>{t('runAllStop')}</button>
            ) : (
              <button className="btn" onClick={start}>{t('runAll')}</button>
            )}
            <button className="btn-icon" aria-label={t('dismiss')} onClick={onClose}>
              <IconX />
            </button>
          </div>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">{t('runAllEmpty')}</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">Endpoint</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Latency</th>
                  <th className="px-3 py-2">Checks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.endpointId}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <MethodBadge method={r.method as any} />
                        <span className="font-mono text-[11px]">{r.path}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {r.status === 'pending' && <span className="text-slate-400">—</span>}
                      {r.status === 'running' && <span className="text-slate-600">{t('sending')}</span>}
                      {r.status === 'skipped' && <span className="text-slate-500">{r.skippedReason}</span>}
                      {r.status === 'errored' && <span className="text-red-600">{r.result?.error?.kind ?? 'error'}</span>}
                      {r.status === 'done' && r.result && (
                        <span className={r.passed ? 'text-emerald-700' : 'text-amber-700'}>
                          {r.result.status} {r.result.statusText}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {r.result?.latencyMs != null ? `${r.result.latencyMs}ms` : ''}
                    </td>
                    <td className="px-3 py-2">
                      {r.status === 'done' && (
                        <div className="flex items-center gap-1">
                          {r.passed ? (
                            <IconCheck className="text-emerald-600" />
                          ) : (
                            <IconAlert className="text-amber-600" />
                          )}
                          {r.validationErrors && r.validationErrors.length > 0 && (
                            <span className="text-red-600">✗ {r.validationErrors.length}</span>
                          )}
                          {r.assertionResults && r.assertionResults.filter(a => !a.passed).length > 0 && (
                            <span className="text-red-600">
                              {r.assertionResults.filter(a => !a.passed).length} a
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
