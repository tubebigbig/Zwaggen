import { useState } from 'react';
import { useSpecStore } from '../state/store';
import { buildExportBundle } from '../exporters/bundle';
import { downloadBlob } from '../storage/file';
import { IconChevron, IconDownload } from './icons';

export function ExportMenu() {
  const { spec } = useSpecStore();
  const [opts, setOpts] = useState({ openapi: 'json' as 'json' | 'yaml' | 'off', jsonschema: true, markdown: true });
  async function run() {
    const blob = await buildExportBundle(spec, {
      openapi: opts.openapi === 'off' ? undefined : opts.openapi,
      jsonschema: opts.jsonschema,
      markdown: opts.markdown,
    });
    downloadBlob(blob, `${spec.info.name.replace(/\s+/g, '-')}.gen-spec.zip`);
  }
  return (
    <details className="relative group">
      <summary className="btn list-none cursor-pointer [&::-webkit-details-marker]:hidden">
        <IconDownload />
        Export
        <IconChevron className="-mr-0.5 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-pop text-sm">
        <label className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">OpenAPI</span>
          <select
            className="select text-xs"
            value={opts.openapi}
            onChange={(e) => setOpts({ ...opts, openapi: e.target.value as 'json' | 'yaml' | 'off' })}
          >
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="off">off</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={opts.jsonschema} onChange={(e) => setOpts({ ...opts, jsonschema: e.target.checked })} />
          JSON Schema
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={opts.markdown} onChange={(e) => setOpts({ ...opts, markdown: e.target.checked })} />
          Markdown
        </label>
        <div className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
          Canonical JSON is always included.
        </div>
        <button className="btn-primary w-full" onClick={() => void run()}>
          <IconDownload />
          Download bundle
        </button>
      </div>
    </details>
  );
}
