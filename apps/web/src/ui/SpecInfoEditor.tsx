import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';

export function SpecInfoEditor() {
  const { t } = useTranslation();
  const { spec, setSpec } = useSpecStore();
  const info = spec.info;
  const patch = (p: Partial<typeof info>) => void setSpec({ ...spec, info: { ...info, ...p } });
  return (
    <div className="space-y-2 text-sm">
      <label className="block">
        <span className="text-xs text-slate-500">{t('specName')}</span>
        <input
          aria-label={t('specName')}
          className="input mt-1"
          value={info.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">{t('baseUrl')}</span>
        <input
          aria-label={t('baseUrl')}
          className="input mt-1 font-mono text-xs"
          value={info.baseUrl ?? ''}
          placeholder="https://api.example.com"
          onChange={(e) => patch({ baseUrl: e.target.value || undefined })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">{t('version')}</span>
        <input
          aria-label={t('version')}
          className="input mt-1 font-mono text-xs"
          value={info.version ?? ''}
          placeholder="0.1.0"
          onChange={(e) => patch({ version: e.target.value || undefined })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">{t('description')}</span>
        <textarea
          aria-label={t('description')}
          className="input mt-1 min-h-[60px] resize-y text-xs"
          value={info.description ?? ''}
          onChange={(e) => patch({ description: e.target.value || undefined })}
        />
      </label>
    </div>
  );
}
