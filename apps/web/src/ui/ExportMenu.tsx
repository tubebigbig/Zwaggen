import { useState } from 'react';
import { useSpecStore } from '../state/store';
import { buildExportBundle } from '../exporters/bundle';
import { downloadBlob } from '../storage/file';

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
    <details className="relative">
      <summary className="rounded border px-2 py-1 cursor-pointer">Export</summary>
      <div className="absolute right-0 z-10 mt-1 space-y-1 rounded border bg-white p-2 shadow text-sm">
        <label>OpenAPI
          <select className="ml-1 border rounded px-1" value={opts.openapi} onChange={(e) => setOpts({ ...opts, openapi: e.target.value as any })}>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="off">off</option>
          </select>
        </label>
        <label className="block"><input type="checkbox" checked={opts.jsonschema} onChange={(e) => setOpts({ ...opts, jsonschema: e.target.checked })} /> JSON Schema</label>
        <label className="block"><input type="checkbox" checked={opts.markdown} onChange={(e) => setOpts({ ...opts, markdown: e.target.checked })} /> Markdown</label>
        <div className="text-xs text-slate-500">Canonical JSON is always included.</div>
        <button className="rounded bg-slate-900 text-white px-2 py-1 mt-1" onClick={() => void run()}>Download bundle</button>
      </div>
    </details>
  );
}
