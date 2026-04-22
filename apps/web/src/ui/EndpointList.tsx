import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconFolderPlus, IconList, IconPencil, IconPlus, IconX } from './icons';
import { MethodBadge } from './MethodBadge';
import { setUiPref, toggleEndpointFolder, toggleEndpointGroup, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';
import { groupByTag, groupByFolder, normalizeFolder, renameFolder, type FolderNode, type Endpoint } from '@zwaggen/core';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Sentinel used as the droppable id for the root (ungrouped) zone. */
export const ENDPOINT_LIST_ROOT_ID = '__root__';

/**
 * Pure helper that decides the target folder for a DnD drop in EndpointList.
 *
 * Returns null when the drop is a no-op (no `over`, drop on self, or target
 * folder matches the endpoint's current folder). Otherwise returns the new
 * folder as a string (null = root / no folder).
 */
export function resolveEndpointFolderFromDragEnd(
  event: DragEndEvent,
  endpoints: readonly Endpoint[],
): { endpointId: string; folder: string | null } | null {
  const active = event.active;
  const over = event.over;
  if (!over) return null;
  const endpointId = String(active.id);
  const overId = String(over.id);
  if (overId === endpointId) return null;
  const ep = endpoints.find((e) => e.id === endpointId);
  if (!ep) return null;
  const currentFolder = ep.folder ?? undefined;
  if (overId === ENDPOINT_LIST_ROOT_ID) {
    if (!currentFolder) return null;
    return { endpointId, folder: null };
  }
  // Sortable rows are droppables too. When overId matches another endpoint id,
  // treat it as a sibling drop — destination is the target's folder
  // (undefined → root). Without this, root-level rows would be read as a
  // folder path and the drop would create a folder named after a UUID.
  const targetEp = endpoints.find((e) => e.id === overId);
  if (targetEp) {
    const targetFolder = targetEp.folder ?? undefined;
    if ((targetFolder ?? '') === (currentFolder ?? '')) return null;
    return { endpointId, folder: targetFolder ?? null };
  }
  if (currentFolder === overId) return null;
  return { endpointId, folder: overId };
}

interface EndpointListItemProps {
  endpoint: Endpoint;
}

function EndpointListItemButton({ endpoint: e }: EndpointListItemProps) {
  const selected = useSpecStore((s) => s.selectedEndpointId);
  const select = useSpecStore((s) => s.selectEndpoint);
  const active = e.id === selected;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
        active
          ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200'
          : 'hover:bg-slate-50'
      }`}
      onClick={() => select(e.id)}
      data-endpoint-id={e.id}
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
  const { spec, setSpec, setEndpointFolder } = useSpecStore();
  const select = useSpecStore((s) => s.selectEndpoint);
  const { endpointsCollapsed, endpointGroupCollapsed } = useUiPrefs();
  const collapsedMap = endpointGroupCollapsed ?? {};

  const sensors = useSensors(
    // 5px activation distance so plain clicks on endpoint rows still fire
    // their onClick (row selection) — only a deliberate movement initiates drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Track the currently-dragged endpoint so droppables can disable themselves
  // when the drop would land on the source's own folder (a no-op). Prevents
  // a false "drop here" highlight (isOver && canDrop, not isOver alone).
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const activeSourceFolder = activeSourceId
    ? (spec.endpoints.find((e) => e.id === activeSourceId)?.folder ?? '')
    : null;

  // Ephemeral folders created via the "+ folder" title button. They're not in
  // the spec yet (folders only persist once an endpoint carries the path).
  // Once an endpoint is dropped in, the folder appears in the real tree and we
  // prune it here.
  const [pendingFolders, setPendingFolders] = useState<string[]>([]);
  const [creatingBuffer, setCreatingBuffer] = useState<string | null>(null);

  const folderTree = useMemo(
    () => groupByFolder(spec.endpoints, (e) => e.folder),
    [spec.endpoints],
  );
  const realFolderPaths = useMemo(() => collectFolderPaths(folderTree), [folderTree]);
  useEffect(() => {
    setPendingFolders((prev) => prev.filter((p) => !realFolderPaths.has(p)));
  }, [realFolderPaths]);

  function commitNewFolder() {
    const buffer = creatingBuffer;
    setCreatingBuffer(null);
    if (buffer === null) return;
    const normalized = normalizeFolder(buffer);
    if (normalized === null || !normalized) return;
    if (realFolderPaths.has(normalized) || pendingFolders.includes(normalized)) return;
    // Each sortable row registers a droppable with id = endpoint.id. Guard
    // against a pending-folder droppable that would collide with that.
    if (spec.endpoints.some((e) => e.id === normalized)) return;
    setPendingFolders((p) => [...p, normalized]);
  }

  async function handleRenameFolder(oldFolder: string, rawNext: string) {
    const normalized = normalizeFolder(rawNext);
    if (normalized === null) return;
    const next = normalized ?? '';
    if (next === oldFolder) return;
    await setSpec(renameFolder(spec, oldFolder, next));
  }

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

  function handleDragStart(event: DragStartEvent) {
    setActiveSourceId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveSourceId(null);
    const resolved = resolveEndpointFolderFromDragEnd(event, spec.endpoints);
    if (!resolved) return;
    await setEndpointFolder(resolved.endpointId, resolved.folder);
  }

  const endpointsWithFolder = spec.endpoints.some((e) => !!e.folder);
  const tagGroups = groupByTag(spec.endpoints);
  // Flat fallback: single group with tag === null means no endpoint has tags
  const flat = tagGroups.length === 1 && tagGroups[0]!.tag === null;
  const showFolderTree = endpointsWithFolder || pendingFolders.length > 0 || creatingBuffer !== null;

  const endpointIds = spec.endpoints.map((e) => e.id);

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
            aria-label={t('newFolder')}
            title={t('newFolder')}
            onClick={() => setCreatingBuffer('')}
          >
            <IconFolderPlus />
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
      {spec.endpoints.length === 0 && pendingFolders.length === 0 && creatingBuffer === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <IconList />
          </div>
          <p className="text-xs text-slate-500">{t('noEndpointsYet')}</p>
          <p className="text-[11px] text-slate-400">{t('noEndpointsHint')}</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={(e) => void handleDragEnd(e)}
          onDragCancel={() => setActiveSourceId(null)}
        >
          <SortableContext items={endpointIds} strategy={verticalListSortingStrategy}>
            {showFolderTree ? (
              <EndpointFolderTree
                tree={folderTree}
                activeSourceFolder={activeSourceFolder}
                onRenameFolder={(p, next) => void handleRenameFolder(p, next)}
                extraRootChildren={
                  <>
                    {creatingBuffer !== null && (
                      <NewFolderRow
                        value={creatingBuffer}
                        onChange={setCreatingBuffer}
                        onCommit={commitNewFolder}
                        onCancel={() => setCreatingBuffer(null)}
                      />
                    )}
                    {pendingFolders.map((p) => (
                      <PendingFolderRow
                        key={p}
                        path={p}
                        activeSourceFolder={activeSourceFolder}
                        onRemove={() => setPendingFolders((prev) => prev.filter((x) => x !== p))}
                      />
                    ))}
                  </>
                }
              />
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
          </SortableContext>
        </DndContext>
      )}
    </aside>
  );
}

function EndpointFolderTree({ tree, activeSourceFolder, onRenameFolder, extraRootChildren }: {
  tree: FolderNode<Endpoint>;
  activeSourceFolder: string | null;
  onRenameFolder(path: string, next: string): void;
  extraRootChildren?: ReactNode;
}) {
  const { endpointFolderCollapsed } = useUiPrefs();
  // Disable the root zone when the dragged endpoint is already at root —
  // same-folder drops are no-ops and shouldn't show a false highlight.
  const rootDroppable = useDroppable({
    id: ENDPOINT_LIST_ROOT_ID,
    disabled: activeSourceFolder === '',
  });
  return (
    <ul
      ref={rootDroppable.setNodeRef}
      className={`thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5 rounded-md ${rootDroppable.isOver ? 'ring-2 ring-brand-400 ring-inset' : ''}`}
      data-droppable-root=""
    >
      {extraRootChildren}
      <FolderTreeLevel node={tree} depth={0} collapsed={endpointFolderCollapsed} activeSourceFolder={activeSourceFolder} onRenameFolder={onRenameFolder} />
    </ul>
  );
}

function FolderTreeLevel({ node, depth, collapsed, activeSourceFolder, onRenameFolder }: { node: FolderNode<Endpoint>; depth: number; collapsed: Record<string, boolean>; activeSourceFolder: string | null; onRenameFolder(path: string, next: string): void }) {
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
          <FolderTreeChild
            key={child.path}
            node={child}
            depth={depth}
            isCollapsed={isCollapsed}
            collapsed={collapsed}
            activeSourceFolder={activeSourceFolder}
            onRenameFolder={onRenameFolder}
          />
        );
      })}
    </>
  );
}

function FolderTreeChild({
  node,
  depth,
  isCollapsed,
  collapsed,
  activeSourceFolder,
  onRenameFolder,
}: {
  node: FolderNode<Endpoint>;
  depth: number;
  isCollapsed: boolean;
  collapsed: Record<string, boolean>;
  activeSourceFolder: string | null;
  onRenameFolder(path: string, next: string): void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(node.name);
  // Disable the folder droppable when the dragged endpoint already lives in
  // this folder — dropping on its own folder is a no-op.
  const droppable = useDroppable({
    id: node.path,
    disabled: activeSourceFolder === node.path,
  });
  function commitRename() {
    if (buffer.includes('/')) { setBuffer(node.name); setEditing(false); return; }
    setEditing(false);
    onRenameFolder(node.path, buildReplacement(node.path, buffer));
  }
  return (
    <li style={{ marginLeft: depth * 12 }}>
      <div
        ref={droppable.setNodeRef}
        className={`group flex items-center gap-1 rounded-md ${droppable.isOver ? 'ring-2 ring-brand-400' : ''}`}
      >
        {editing ? (
          <div className="flex flex-1 items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
            <input
              autoFocus
              aria-label={t('renameFolder')}
              className="input flex-1 py-0.5 font-mono text-xs"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setBuffer(node.name); }
              }}
            />
            <span className="ml-auto text-[10px] font-normal text-slate-400">{node.totalCount}</span>
          </div>
        ) : (
          <button
            type="button"
            className="flex flex-1 items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
            onClick={() => toggleEndpointFolder(node.path)}
          >
            {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
            <span>{node.name}</span>
            <span className="ml-auto text-[10px] font-normal text-slate-400">{node.totalCount}</span>
          </button>
        )}
        <button
          type="button"
          className="btn-icon opacity-0 group-hover:opacity-100"
          aria-label={t('renameFolder')}
          title={t('renameFolder')}
          onClick={(e) => { e.stopPropagation(); setBuffer(node.name); setEditing(true); }}
        >
          <IconPencil />
        </button>
      </div>
      {!isCollapsed && (
        <ul className="space-y-0.5">
          <FolderTreeLevel node={node} depth={depth + 1} collapsed={collapsed} activeSourceFolder={activeSourceFolder} onRenameFolder={onRenameFolder} />
        </ul>
      )}
    </li>
  );
}

/** Build the target folder for a rename: swap the last segment of `oldPath` with `newSegment`. */
function buildReplacement(oldPath: string, newSegment: string): string {
  const i = oldPath.lastIndexOf('/');
  return i < 0 ? newSegment : `${oldPath.slice(0, i)}/${newSegment}`;
}

function collectFolderPaths(node: FolderNode<unknown>, out: Set<string> = new Set()): Set<string> {
  for (const c of node.children) {
    out.add(c.path);
    collectFolderPaths(c, out);
  }
  return out;
}

function NewFolderRow({ value, onChange, onCommit, onCancel }: {
  value: string;
  onChange(next: string): void;
  onCommit(): void;
  onCancel(): void;
}) {
  const { t } = useTranslation();
  const skipNextCommit = useRef(false);
  return (
    <li>
      <div className="flex items-center gap-1 rounded-md">
        <div className="flex flex-1 items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <IconChevronDown />
          <input
            autoFocus
            aria-label={t('newFolder')}
            className="input flex-1 py-0.5 font-mono text-xs"
            placeholder={t('folderPlaceholder')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              if (skipNextCommit.current) { skipNextCommit.current = false; return; }
              onCommit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') {
                e.preventDefault();
                skipNextCommit.current = true;
                onCancel();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
      </div>
    </li>
  );
}

function PendingFolderRow({ path, activeSourceFolder, onRemove }: {
  path: string;
  activeSourceFolder: string | null;
  onRemove(): void;
}) {
  const { t } = useTranslation();
  const droppable = useDroppable({
    id: path,
    disabled: activeSourceFolder === path,
  });
  return (
    <li>
      <div
        ref={droppable.setNodeRef}
        className={`group flex items-center gap-1 rounded-md ${droppable.isOver ? 'ring-2 ring-brand-400' : ''}`}
        data-pending-folder={path}
      >
        <div className="flex flex-1 items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <IconChevronDown />
          <span className="truncate">{path}</span>
          <span className="ml-auto text-[10px] font-normal text-slate-300">0</span>
        </div>
        <button
          type="button"
          className="btn-icon opacity-0 group-hover:opacity-100"
          aria-label={t('cancelNewFolder')}
          title={t('cancelNewFolder')}
          onClick={onRemove}
        >
          <IconX />
        </button>
      </div>
    </li>
  );
}
