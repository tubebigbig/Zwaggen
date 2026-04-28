import { useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  buildRequest,
  generateClient,
  generateTs,
  generateZod,
  resolveParamFields,
  toCurl,
  toOpenApi,
} from '@zwaggen/core';
import type { Endpoint, Spec } from '@zwaggen/core';
import { endpointToMarkdown } from '../exporters/markdown';
import { IconX } from './icons';
import { useSpecStore } from '../state/store';

export type ExportScope =
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'type'; typeKey: string }
  | { kind: 'folder'; prefix: string };

interface Props {
  scope: ExportScope;
  onClose: () => void;
}

interface Tab {
  id: string;
  label: string;
  output: string;
  filename: string;
}

export function ExportPopover({ scope, onClose }: Props) {
  const { t } = useTranslation();
  const spec = useSpecStore((s) => s.spec);

  const tabs: Tab[] = useMemo(() => buildTabs(scope, spec, t), [scope, spec, t]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id ?? '');
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-popover-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-pop">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="export-popover-title" className="text-sm font-semibold">
            {titleFor(scope, t)}
          </h2>
          <button className="btn-icon" aria-label={t('dismiss')} onClick={onClose}>
            <IconX />
          </button>
        </header>
        {tabs.length > 1 && (
          <div role="tablist" className="flex gap-1 border-b border-slate-100 px-3 py-2">
            {tabs.map((tab) => {
              const isActive = tab.id === active?.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    isActive
                      ? 'bg-slate-100 font-semibold text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
        {active && <Pane key={active.id} tab={active} />}
      </div>
    </div>
  );
}

function Pane({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tab.output);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API rejected (older browser, insecure context, missing
      // permission). Surface the unselectable textarea, focus + select-all,
      // and tell the user to press Ctrl/Cmd-C themselves.
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
      setCopyFailed(true);
    }
  }

  function download() {
    const blob = new Blob([tab.output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs">
        <button type="button" onClick={copy} className="btn">
          {copied ? t('copied') : t('copyOutput')}
        </button>
        <button type="button" onClick={download} className="btn">
          {t('downloadOutput')}
        </button>
        {copyFailed && (
          <span className="text-amber-700">{t('copyFallbackHint')}</span>
        )}
        <span className="ml-auto font-mono text-slate-500">{tab.filename}</span>
      </div>
      <pre className="thin-scroll flex-1 overflow-auto whitespace-pre-wrap bg-slate-50 px-4 py-3 font-mono text-xs text-slate-800">
        {tab.output}
      </pre>
      <textarea
        ref={fallbackRef}
        value={tab.output}
        readOnly
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function titleFor(scope: ExportScope, t: TFunction): string {
  if (scope.kind === 'endpoint') return `${t('export')}: ${scope.endpointId}`;
  if (scope.kind === 'type') return `${t('export')}: ${scope.typeKey}`;
  return `${t('exportFolder')}: ${scope.prefix}`;
}

function placeholderInputs(ep: Endpoint, spec: Spec) {
  const path: Record<string, string> = {};
  for (const p of ep.pathParams) path[p.name] = `{{${p.name}}}`;

  const query: Record<string, string> = {};
  for (const f of resolveParamFields(ep.queryParams, spec)) query[f.name] = `{{${f.name}}}`;

  const headers: Record<string, string> = {};
  for (const f of resolveParamFields(ep.headers, spec)) headers[f.name] = `{{${f.name}}}`;

  const body: unknown = ep.requestBody ? '/* fill in */' : undefined;

  return { path, query, headers, body };
}

function buildTabs(scope: ExportScope, spec: Spec, t: TFunction): Tab[] {
  if (scope.kind === 'endpoint') {
    const ep = spec.endpoints.find((e) => e.id === scope.endpointId);
    if (!ep) return [];
    const inputs = placeholderInputs(ep, spec);
    // Pass `secrets: {}` — share-safe by construction. The runner's
    // substitute() leaves any `${var}` references unresolved (since vars/
    // secrets are empty), and `placeholderInputs` only emits {{name}}
    // markers, so the cURL command never contains real secret values.
    // No `secretMask` is needed for the same reason.
    const built = buildRequest({
      spec,
      endpoint: ep,
      baseUrl: spec.info.baseUrl ?? '{{base-url}}',
      inputs,
      secrets: {},
      useProxy: false,
    });
    const only = { endpointIds: [ep.id] };
    return [
      {
        id: 'curl',
        label: t('exportTabCurl'),
        output: toCurl(built),
        filename: `${ep.id}.curl.sh`,
      },
      {
        id: 'types',
        label: t('exportTabTypes'),
        output: generateTs(spec, { only }),
        filename: `${ep.id}.types.ts`,
      },
      {
        id: 'schemas',
        label: t('exportTabSchemas'),
        output: generateZod(spec, { only }),
        filename: `${ep.id}.schemas.ts`,
      },
      {
        id: 'client',
        label: t('exportTabClient'),
        output: generateClient(spec, { only }),
        filename: `${ep.id}.client.ts`,
      },
      {
        id: 'markdown',
        label: t('exportTabMarkdown'),
        output: endpointToMarkdown(ep, spec),
        filename: `${ep.id}.md`,
      },
      {
        id: 'openapi',
        label: t('exportTabOpenApi'),
        output: JSON.stringify(
          toOpenApi(spec, { only }),
          null,
          2,
        ),
        filename: `${ep.id}.openapi.json`,
      },
    ];
  }
  if (scope.kind === 'type') {
    const flatKey = scope.typeKey.replace(/\//g, '_');
    const tsOut = generateTs(spec, { only: { typeKeys: [scope.typeKey] } });
    const zodOut = generateZod(spec, { only: { typeKeys: [scope.typeKey] } });
    const oas = toOpenApi(spec, { only: { typeKeys: [scope.typeKey] } });
    const fragment = oas.components?.schemas?.[flatKey];
    return [
      {
        id: 'ts',
        label: t('exportTabTsInterface'),
        output: tsOut,
        filename: `${flatKey}.ts`,
      },
      {
        id: 'zod',
        label: t('exportTabZod'),
        output: zodOut,
        filename: `${flatKey}.schema.ts`,
      },
      {
        id: 'json-schema',
        label: t('exportTabJsonSchema'),
        output: fragment
          ? JSON.stringify(fragment, null, 2)
          : `// type "${scope.typeKey}" not found in OpenAPI components — may be a primitive`,
        filename: `${flatKey}.schema.json`,
      },
    ];
  }
  if (scope.kind === 'folder') {
    const only = { folderPrefix: scope.prefix };
    // Avoid `.types.ts` (leading-dot, hidden on macOS) for root prefix.
    const folderName = scope.prefix.split('/').pop() || scope.prefix || 'root';
    return [
      {
        id: 'types',
        label: t('exportTabTypes'),
        output: generateTs(spec, { only }),
        filename: `${folderName}.types.ts`,
      },
      {
        id: 'schemas',
        label: t('exportTabSchemas'),
        output: generateZod(spec, { only }),
        filename: `${folderName}.schemas.ts`,
      },
      {
        id: 'client',
        label: t('exportTabClient'),
        output: generateClient(spec, { only }),
        filename: `${folderName}.client.ts`,
      },
      {
        id: 'openapi',
        label: t('exportTabOpenApi'),
        output: JSON.stringify(toOpenApi(spec, { only }), null, 2),
        filename: `${folderName}.openapi.json`,
      },
    ];
  }
  return [];
}
