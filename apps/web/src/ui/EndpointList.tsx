import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconFolderPlus, IconList, IconPlus, IconX } from './icons';
import { MethodBadge } from './MethodBadge';
import { OverflowMenu } from './OverflowMenu';
import { MenuItem } from './MenuItem';
import { setUiPref, toggleEndpointFolder, toggleEndpointGroup, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';
import { groupByTag, groupByFolder, normalizeFolder, renameFolder, type FolderNode, type Endpoint } from '@zwaggen/core';

export type ExportScope =
  | { kind: 'endpoint'; endpointId: string }
  | { kind: 'folder'; prefix: string };
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
import { useDndAnnouncements } from './dndAnnouncements';

/**
 * Sentinel used as the droppable id for the root (ungrouped) zone. Uses a
 * value that `isValidSegment` rejects (the `$` character is not in the
 * folder-segment allow-list `[A-Za-z0-9_. -]`) so a user cannot create a
 * folder whose name collides with this id. Both panels can share the same
 * sentinel value because each is scoped to its own `DndContext`.
 */
export const ENDPOINT_LIST_ROOT_ID = '$$ROOT$$';

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

function EndpointListItem({ endpoint, onExport }: EndpointListItemProps & { onExport?: (s: ExportScope) => void }) {
  return (
    <li key={endpoint.id} className="group relative">
      <EndpointListItemButton endpoint={endpoint} />
      <div className="pointer-events-none absolute z-[1] right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <EndpointRowMenu endpoint={endpoint} onExport={onExport} />
      </div>
    </li>
  );
}

function EndpointRowMenu({ endpoint, onExport }: { endpoint: Endpoint; onExport?: (s: ExportScope) => void }) {
  const { t } = useTranslation();
  const deleteEndpoint = useSpecStore((s) => s.deleteEndpoint);
  const duplicateEndpoint = useSpecStore((s) => s.duplicateEndpoint);
  return (
    <OverflowMenu>
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          onExport?.({ kind: 'endpoint', endpointId: endpoint.id });
        }}
      >
        {t('export')}
      </MenuItem>
      <MenuItem
        onClick={async (e) => {
          e.stopPropagation();
          await duplicateEndpoint(endpoint.id);
        }}
      >
        {t('duplicate')}
      </MenuItem>
      <MenuItem
        danger
        onClick={async (e) => {
          e.stopPropagation();
          if (!confirm(t('deleteThisEndpoint'))) return;
          await deleteEndpoint(endpoint.id);
        }}
      >
        {t('delete')}
      </MenuItem>
    </OverflowMenu>
  );
}

export function EndpointList({ onExport }: { onExport?: (s: ExportScope) => void } = {}) {
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
  const announcements = useDndAnnouncements();

  // Ephemeral aria-live banner — symmetrical with TypePanel. Endpoints are
  // keyed by id (never collide), but this keeps the UX shape identical so
  // future per-folder id-shape rules (if any) would have a surface ready.
  const [dndAlert, setDndAlert] = useState<string | null>(null);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
  }, []);
  function showDndAlert(message: string) {
    setDndAlert(message);
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => setDndAlert(null), 4000);
  }

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
        id, method: 'GET', path: '/', pathParams: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
      }],
    });
    select(id);
  }

  async function addInFolder(folder: string) {
    const id = crypto.randomUUID();
    await setSpec({
      ...spec,
      endpoints: [...spec.endpoints, {
        id, method: 'GET', path: '/', pathParams: [],
        requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
        folder,
      }],
    });
    select(id);
  }

  function startSubfolder(parentPath: string): void {
    setCreatingBuffer(`${parentPath}/`);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveSourceId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveSourceId(null);
    const resolved = resolveEndpointFolderFromDragEnd(event, spec.endpoints);
    if (!resolved) return;
    const result = await setEndpointFolder(resolved.endpointId, resolved.folder);
    if (!result.ok && result.reason === 'collision') {
      const ep = spec.endpoints.find((e) => e.id === resolved.endpointId);
      const label = ep?.path ?? resolved.endpointId;
      showDndAlert(t('dndCollisionMessage', { name: label, folder: resolved.folder ?? '/' }));
    }
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
      {dndAlert && (
        <div
          role="alert"
          aria-live="polite"
          className="m-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
          data-testid="endpoint-list-dnd-alert"
        >
          {dndAlert}
        </div>
      )}
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
          accessibility={{ announcements }}
        >
          <SortableContext items={endpointIds} strategy={verticalListSortingStrategy}>
            {showFolderTree ? (
              <EndpointFolderTree
                tree={folderTree}
                activeSourceFolder={activeSourceFolder}
                onRenameFolder={(p, next) => void handleRenameFolder(p, next)}
                onExport={onExport}
                onAddEndpoint={(folder) => void addInFolder(folder)}
                onAddSubfolder={startSubfolder}
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
                        onAddEndpoint={addInFolder}
                      />
                    ))}
                  </>
                }
              />
            ) : flat ? (
              <ul className="thin-scroll flex-1 space-y-0.5 overflow-y-auto p-1.5">
                {tagGroups[0]!.endpoints.map((e) => (
                  <EndpointListItem key={e.id} endpoint={e} onExport={onExport} />
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
                            <EndpointListItem key={`${key}:${e.id}`} endpoint={e} onExport={onExport} />
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

function EndpointFolderTree({ tree, activeSourceFolder, onRenameFolder, onExport, onAddEndpoint, onAddSubfolder, extraRootChildren }: {
  tree: FolderNode<Endpoint>;
  activeSourceFolder: string | null;
  onRenameFolder(path: string, next: string): void;
  onExport?: (s: ExportScope) => void;
  onAddEndpoint?: (folder: string) => void;
  onAddSubfolder?: (parentPath: string) => void;
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
      <FolderTreeLevel node={tree} depth={0} collapsed={endpointFolderCollapsed} activeSourceFolder={activeSourceFolder} onRenameFolder={onRenameFolder} onExport={onExport} onAddEndpoint={onAddEndpoint} onAddSubfolder={onAddSubfolder} />
    </ul>
  );
}

function FolderTreeLevel({ node, depth, collapsed, activeSourceFolder, onRenameFolder, onExport, onAddEndpoint, onAddSubfolder }: { node: FolderNode<Endpoint>; depth: number; collapsed: Record<string, boolean>; activeSourceFolder: string | null; onRenameFolder(path: string, next: string): void; onExport?: (s: ExportScope) => void; onAddEndpoint?: (folder: string) => void; onAddSubfolder?: (parentPath: string) => void }) {
  return (
    <>
      {node.items.map((e) => (
        <li key={e.id} className="group relative" style={{ marginLeft: depth * 12 }}>
          <EndpointListItemButton endpoint={e} />
          <div className="pointer-events-none absolute z-[1] right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <EndpointRowMenu endpoint={e} onExport={onExport} />
          </div>
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
            onExport={onExport}
            onAddEndpoint={onAddEndpoint}
            onAddSubfolder={onAddSubfolder}
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
  onExport,
  onAddEndpoint,
  onAddSubfolder,
}: {
  node: FolderNode<Endpoint>;
  depth: number;
  isCollapsed: boolean;
  collapsed: Record<string, boolean>;
  activeSourceFolder: string | null;
  onRenameFolder(path: string, next: string): void;
  onExport?: (s: ExportScope) => void;
  onAddEndpoint?: (folder: string) => void;
  onAddSubfolder?: (parentPath: string) => void;
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
        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            className="btn-icon"
            aria-label={t('addEndpointToFolder')}
            title={t('addEndpointToFolder')}
            onClick={(e) => { e.stopPropagation(); onAddEndpoint?.(node.path); }}
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={t('addSubfolder')}
            title={t('addSubfolder')}
            onClick={(e) => { e.stopPropagation(); onAddSubfolder?.(node.path); }}
          >
            <IconFolderPlus />
          </button>
          <FolderRowMenu
            node={node}
            onExport={onExport}
            onRename={() => { setBuffer(node.name); setEditing(true); }}
          />
        </div>
      </div>
      {!isCollapsed && (
        <ul className="space-y-0.5">
          <FolderTreeLevel node={node} depth={depth + 1} collapsed={collapsed} activeSourceFolder={activeSourceFolder} onRenameFolder={onRenameFolder} onExport={onExport} onAddEndpoint={onAddEndpoint} onAddSubfolder={onAddSubfolder} />
        </ul>
      )}
    </li>
  );
}

function FolderRowMenu({ node, onExport, onRename }: {
  node: FolderNode<Endpoint>;
  onExport?: (s: ExportScope) => void;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const deleteEndpointFolder = useSpecStore((s) => s.deleteEndpointFolder);
  return (
    <OverflowMenu>
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          onExport?.({ kind: 'folder', prefix: node.path });
        }}
      >
        {t('exportFolder')}
      </MenuItem>
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          onRename();
        }}
      >
        {t('renameFolder')}
      </MenuItem>
      <MenuItem
        danger
        onClick={(e) => {
          e.stopPropagation();
          if (!confirm(t('deleteFolderConfirm', { path: node.path, count: node.totalCount }))) return;
          void deleteEndpointFolder(node.path);
        }}
      >
        {t('deleteFolder')}
      </MenuItem>
    </OverflowMenu>
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

function PendingFolderRow({ path, activeSourceFolder, onRemove, onAddEndpoint }: {
  path: string;
  activeSourceFolder: string | null;
  onRemove(): void;
  onAddEndpoint?: (folder: string) => void;
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
        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            className="btn-icon"
            aria-label={t('addEndpointToFolder')}
            title={t('addEndpointToFolder')}
            onClick={(e) => { e.stopPropagation(); onAddEndpoint?.(path); }}
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={t('cancelNewFolder')}
            title={t('cancelNewFolder')}
            onClick={onRemove}
          >
            <IconX />
          </button>
        </div>
      </div>
    </li>
  );
}
