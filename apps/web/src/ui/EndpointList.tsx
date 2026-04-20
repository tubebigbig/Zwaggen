import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconList, IconPlus } from './icons';
import { MethodBadge } from './MethodBadge';
import { setUiPref, toggleEndpointFolder, toggleEndpointGroup, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';
import { groupByTag } from '../schema/groupByTag';
import { groupByFolder, type FolderNode } from '../schema/groupByFolder';
import type { Endpoint } from '../schema/types';

interface EndpointListItemProps {
  endpoint: Endpoint;
}

function EndpointListItemButton({ endpoint: e }: EndpointListItemProps) {
  const selected = useSpecStore((s) => s.selectedEndpointId);
  const select = useSpecStore((s) => s.selectEndpoint);
  const active = e.id === selected;
  return (
    <button
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
        active
          ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200'
          : 'hover:bg-slate-50'
      }`}
      onClick={() => select(e.id)}
    >
      <MethodBadge method={e.method} />
      <span className="truncate font-mono text-xs text-slate-700">{e.path}</span>
    </button>
  );
}

function EndpointListItem({ endpoint }: EndpointListItemProps) {
  return (
    <li key={endpoint.id}>
      <EndpointListItemButton endpoint={endpoint} />
    </li>
  );
}

export function EndpointList() {
  const { t } = useTranslation();
  const { spec, setSpec } = useSpecStore();
  const select = useSpecStore((s) => s.selectEndpoint);
  const { endpointsCollapsed, endpointGroupCollapsed } = useUiPrefs();
  const collapsedMap = endpointGroupCollapsed ?? {};

  if (endpointsCollapsed) {
    return (
      <CollapsedRail
        label={t('endpoints')}
        icon={<IconList />}
        side="left"
        onExpand={() => setUiPref('endpointsCollapsed', false)}
        count={spec.endpoints.length}
      />
    );
  }

  async function add() {
    const id = crypto.randomUUID();
    await setSpec({
      ...spec,
      endpoints: [...spec.endpoints, {
        id, method: 'GET', path: '/', pathParams: [], queryParams: [], headers: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      }],
    });
    select(id);
  }

  const endpointsWithFolder = spec.endpoints.some((e) => !!e.folder);
  const tagGroups = groupByTag(spec.endpoints);
  // Flat fallback: single group with tag === null means no endpoint has tags
  const flat = tagGroups.length === 1 && tagGroups[0]!.tag === null;

  const folderTree = useMemo(
    () => groupByFolder(spec.endpoints, (e) => e.folder),
    [spec.endpoints],
  );

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <h2 className="panel-title">{t('endpoints')}</h2>
        <div className="flex items-center gap-1">
          <button
            className="btn-icon"
            aria-label={t('newEndpoint')}
            title={t('newEndpoint')}
            onClick={() => void add()}
          >
            <IconPlus />
          </button>
          <button
            className="btn-icon"
            aria-label={t('collapseEndpoints')}
            title={t('collapse')}
            onClick={() => setUiPref('endpointsCollapsed', true)}
          >
            <IconChevronLeft />
          </button>
        </div>
      </div>
      {spec.endpoints.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <IconList />
          </div>
          <p className="text-xs text-slate-500">{t('noEndpointsYet')}</p>
          <p className="text-[11px] text-slate-400">{t('noEndpointsHint')}</p>
        </div>
      ) : endpointsWithFolder ? (
        <EndpointFolderTree tree={folderTree} />
      ) : flat ? (
        <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {tagGroups[0]!.endpoints.map((e) => (
            <EndpointListItem key={e.id} endpoint={e} />
          ))}
        </ul>
      ) : (
        <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {tagGroups.map((g) => {
            const key = g.tag ?? '__untagged';
            const collapsed = !!collapsedMap[key];
            return (
              <li key={key}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
                  onClick={() => toggleEndpointGroup(key)}
                >
                  {collapsed ? <IconChevronRight /> : <IconChevronDown />}
                  <span>{g.tag ?? t('untagged')}</span>
                  <span className="ml-auto text-[10px] font-normal text-slate-400">{g.endpoints.length}</span>
                </button>
                {!collapsed && (
                  <ul className="ml-2 space-y-0.5">
                    {g.endpoints.map((e) => (
                      <EndpointListItem key={`${key}:${e.id}`} endpoint={e} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function EndpointFolderTree({ tree }: { tree: FolderNode<Endpoint> }) {
  const { endpointFolderCollapsed } = useUiPrefs();
  return (
    <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
      <FolderTreeLevel node={tree} depth={0} collapsed={endpointFolderCollapsed} />
    </ul>
  );
}

function FolderTreeLevel({ node, depth, collapsed }: { node: FolderNode<Endpoint>; depth: number; collapsed: Record<string, boolean> }) {
  return (
    <>
      {node.items.map((e) => (
        <li key={e.id} style={{ marginLeft: depth * 12 }}>
          <EndpointListItemButton endpoint={e} />
        </li>
      ))}
      {node.children.map((child) => {
        const isCollapsed = !!collapsed[child.path];
        return (
          <li key={child.path} style={{ marginLeft: depth * 12 }}>
            <button
              type="button"
              className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
              onClick={() => toggleEndpointFolder(child.path)}
            >
              {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
              <span>{child.name}</span>
              <span className="ml-auto text-[10px] font-normal text-slate-400">{child.totalCount}</span>
            </button>
            {!isCollapsed && (
              <ul className="space-y-0.5">
                <FolderTreeLevel node={child} depth={depth + 1} collapsed={collapsed} />
              </ul>
            )}
          </li>
        );
      })}
    </>
  );
}
