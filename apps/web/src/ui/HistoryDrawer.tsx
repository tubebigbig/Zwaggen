import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearEndpointHistory,
  loadHistory,
  type HistoryEntry,
} from '../storage/history';
import { IconClock, IconPlay, IconTrash } from './icons';
import { ResponseView } from './ResponseView';

interface Props {
  endpointId: string;
  epoch: number;
  onReplay: (e: HistoryEntry) => void;
}

export function HistoryDrawer({ endpointId, epoch, onReplay }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHistory(endpointId).then((list) => {
      if (alive) setEntries(list);
    });
    return () => { alive = false; };
  }, [endpointId, epoch]);

  async function clear() {
    if (!confirm(t('confirmClearHistory'))) return;
    await clearEndpointHistory(endpointId);
    setEntries([]);
    setOpenId(null);
  }

  if (entries.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-500">
        {t('noHistory')}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 text-xs">
        <div className="flex items-center gap-1 font-medium text-slate-600">
          <IconClock width={12} height={12} />
          {t('history')}
        </div>
        <button
          className="flex items-center gap-1 text-slate-400 hover:text-red-600"
          onClick={() => void clear()}
        >
          <IconTrash width={12} height={12} />
          <span>{t('clearHistory')}</span>
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {entries.map((e) => {
          const isOpen = openId === e.id;
          return (
            <li key={e.id}>
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                <button
                  className="flex-1 text-left hover:text-brand-700"
                  onClick={() => setOpenId(isOpen ? null : e.id)}
                >
                  <time>{new Date(e.at).toLocaleTimeString()}</time>
                  {' · '}
                  <span>{e.result.status ?? e.result.errorKind ?? '—'}</span>
                  {e.result.latencyMs != null && <span> · {e.result.latencyMs}ms</span>}
                  {e.result.validationErrors && e.result.validationErrors.length > 0 && (
                    <span className="ml-1 text-red-600">
                      ✗ {e.result.validationErrors.length}
                    </span>
                  )}
                </button>
                <button
                  className="btn-icon"
                  title={t('replay')}
                  aria-label={t('replay')}
                  onClick={() => onReplay(e)}
                >
                  <IconPlay />
                </button>
              </div>
              {isOpen && <StoredResponse entry={e} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StoredResponse({ entry }: { entry: HistoryEntry }) {
  const { t } = useTranslation();
  let body: unknown;
  try {
    body = entry.result.rawText ? JSON.parse(entry.result.rawText) : undefined;
  } catch {
    body = entry.result.rawText;
  }
  return (
    <div className="border-t border-slate-100 bg-slate-50/50 p-2">
      {entry.result.rawTruncated && (
        <div className="mb-1 text-[11px] text-amber-700">{t('truncated')}</div>
      )}
      {body !== undefined && (
        <ResponseView body={body} errors={entry.result.validationErrors ?? []} />
      )}
    </div>
  );
}
