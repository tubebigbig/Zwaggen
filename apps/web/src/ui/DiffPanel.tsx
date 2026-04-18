import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Spec } from '../schema/types';
import { diffSpecs } from '../schema/diff';
import { IconX, IconAlert, IconCheck } from './icons';

interface Props {
  base: Spec;
  current: Spec;
  onClose: () => void;
}

export function DiffPanel({ base, current, onClose }: Props) {
  const { t } = useTranslation();
  const diff = useMemo(() => diffSpecs(base, current), [base, current]);
  const total = diff.breaking.length + diff.nonBreaking.length;

  return (
    <div
      role="dialog"
      aria-label={t('diffTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold">
            {t('diffTitle')}
            {total > 0 && (
              <span className="ml-2 text-slate-500">
                · {t('diffBreaking', { n: diff.breaking.length })} · {t('diffNonBreaking', { n: diff.nonBreaking.length })}
              </span>
            )}
          </h2>
          <button className="btn-icon" aria-label={t('dismiss')} onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto p-3 text-xs">
          {total === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              <IconCheck className="mx-auto mb-2 text-emerald-600" />
              {t('diffNoChanges')}
            </div>
          ) : (
            <>
              {diff.breaking.length > 0 && (
                <section className="mb-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                    <IconAlert className="mr-1 inline" />
                    {t('diffBreaking', { n: diff.breaking.length })}
                  </h3>
                  <ul className="space-y-1">
                    {diff.breaking.map((e, i) => (
                      <li key={i} className="rounded bg-red-50 p-2">
                        <div className="font-mono text-[10px] text-red-700">{e.kind}</div>
                        <div className="font-mono text-slate-700">{e.location}</div>
                        <div className="text-slate-600">{e.summary}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {diff.nonBreaking.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {t('diffNonBreaking', { n: diff.nonBreaking.length })}
                  </h3>
                  <ul className="space-y-1">
                    {diff.nonBreaking.map((e, i) => (
                      <li key={i} className="rounded bg-slate-50 p-2">
                        <div className="font-mono text-[10px] text-slate-500">{e.kind}</div>
                        <div className="font-mono text-slate-700">{e.location}</div>
                        <div className="text-slate-600">{e.summary}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
