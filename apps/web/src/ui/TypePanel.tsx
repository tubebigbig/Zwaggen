import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpecStore } from '../state/store';
import { TypeBuilder } from './TypeBuilder';
import {
  renameType,
  renameFolder,
  collectBrokenRefs,
  buildUsageIndex,
  groupByFolder,
  splitKey,
  joinKey,
  normalizeFolder,
  type FolderNode,
} from '@zwaggen/core';
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
import { IconAlert, IconChevronDown, IconChevronRight, IconCube, IconFolderPlus, IconPlus, IconTrash, IconX } from './icons';
import { setUiPref, toggleTypeFolder, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';
import { useDndAnnouncements } from './dndAnnouncements';
import { OverflowMenu } from './OverflowMenu';
import { MenuItem } from './MenuItem';

export type TypePanelExportScope =
  | { kind: 'type'; typeKey: string }
  | { kind: 'folder'; prefix: string };

interface TypeItem { key: string; folder: string | undefined; name: string }

/**
 * Sentinel used as the droppable id for the root (ungrouped) zone. Uses a
 * value that `isValidSegment` rejects (the `$` character is not in the
 * folder-segment allow-list `[A-Za-z0-9_. -]`) so a user cannot create a
 * folder whose name collides with this id. Both panels can share the same
 * sentinel value because each is scoped to its own `DndContext`.
 */
export const TYPE_PANEL_ROOT_ID = '$$ROOT$$';

/**
 * Pure helper that decides the target folder for a DnD drop in TypePanel.
 *
 * Returns null when the drop is a no-op (no `over`, drop on self, or target
 * folder equals the current folder). Otherwise returns the new folder as a
 * string (empty string = root / no folder).
 */
export function resolveTypeFolderFromDragEnd(
  event: DragEndEvent,
  typeKeys: readonly string[],
): { typeKey: string; folder: string | null } | null {
  const active = event.active;
  const over = event.over;
  if (!over) return null;
  const typeKey = String(active.id);
  const overId = String(over.id);
  if (overId === typeKey) return null;
  const { folder: currentFolder } = splitKey(typeKey);
  if (overId === TYPE_PANEL_ROOT_ID) {
    if (!currentFolder) return null;
    return { typeKey, folder: null };
  }
  // Sortable rows are droppables too. When overId matches an existing type
  // key, treat it as a sibling drop — destination is the target's folder
  // (undefined → root). Without this, root-level rows would be read as a
  // folder path and the drop would create a folder named after the row.
  if (typeKeys.includes(overId)) {
    const { folder: targetFolder } = splitKey(overId);
    if ((targetFolder ?? '') === (currentFolder ?? '')) return null;
    return { typeKey, folder: targetFolder ?? null };
  }
  // `overId` is a folder path (header drop).
  if (currentFolder === overId) return null;
  return { typeKey, folder: overId };
}

export function TypePanel({ onExport }: { onExport?: (s: TypePanelExportScope) => void } = {}) {
  const { t } = useTranslation();
  const { spec, setSpec, selectEndpoint, setTypeFolder, duplicateType } = useSpecStore();
  const { typesCollapsed, typeFolderCollapsed } = useUiPrefs();
  const typeKeys = Object.keys(spec.types).sort();
  const anyInFolder = typeKeys.some((k) => k.includes('/'));

  const items: TypeItem[] = useMemo(() =>
    typeKeys.map((k) => { const s = splitKey(k); return { key: k, folder: s.folder, name: s.name }; }),
    [typeKeys.join('|')]);

  const tree = useMemo(() => groupByFolder(items, (i) => i.folder), [items]);

  const [selected, setSelected] = useState<string | null>(typeKeys[0] ?? null);
  // Track the currently-dragged type key so droppables can disable themselves
  // when the drop would land on the source's own folder (a no-op). Prevents
  // a false "drop here" highlight (isOver && canDrop, not isOver alone).
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const activeSourceFolder = activeSourceId
    ? (splitKey(activeSourceId).folder ?? '')
    : null;

  // Ephemeral aria-live banner shown for a few seconds after a DnD collision
  // (target folder already has a type with the same name). Cleared on unmount
  // and superseded by any newer alert so users only see the freshest message.
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

  // Ephemeral folders created via the "+ folder" title button. They're not in
  // the spec yet (folders only persist when a type carries the path). Once a
  // type is dropped in, the folder appears in `tree` and we prune it here.
  const [pendingFolders, setPendingFolders] = useState<string[]>([]);
  const [creatingBuffer, setCreatingBuffer] = useState<string | null>(null);
  const realFolderPaths = useMemo(() => collectFolderPaths(tree), [tree]);
  useEffect(() => {
    setPendingFolders((prev) => prev.filter((p) => !realFolderPaths.has(p)));
  }, [realFolderPaths]);
  const broken = collectBrokenRefs(spec);
  const usageIndex = useMemo(() => buildUsageIndex(spec), [spec]);
  const usages = selected ? (usageIndex[selected] ?? []) : [];

  const sensors = useSensors(
    // 5px activation distance so plain clicks on draggable rows still fire
    // their onClick (row selection) — only a deliberate movement initiates drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements = useDndAnnouncements();

  function handleDragStart(event: DragStartEvent) {
    setActiveSourceId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveSourceId(null);
    const resolved = resolveTypeFolderFromDragEnd(event, typeKeys);
    if (!resolved) return;
    const prev = resolved.typeKey;
    const { name } = splitKey(prev);
    const nextKey = joinKey(resolved.folder ?? undefined, name);
    const result = await setTypeFolder(resolved.typeKey, resolved.folder);
    if (!result.ok) {
      if (result.reason === 'collision') {
        showDndAlert(t('dndCollisionMessage', { name, folder: resolved.folder ?? '/' }));
      }
      return;
    }
    if (selected === prev && !spec.types[prev]) {
      // setTypeFolder renames; the old key is gone. Follow the selection.
      setSelected(nextKey);
    } else if (selected === prev) {
      setSelected(nextKey);
    }
  }

  useEffect(() => {
    if (typesCollapsed) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setUiPref('typesCollapsed', true); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typesCollapsed]);

  async function addType() {
    // New type always lands at root with a generated unique short name.
    let name = 'NewType'; let i = 1;
    while (spec.types[name]) name = `NewType${i++}`;
    await setSpec({ ...spec, types: { ...spec.types, [name]: { kind: 'object', fields: [] } } });
    setSelected(name);
  }

  async function addTypeInFolder(folder: string) {
    let name = 'NewType';
    let i = 1;
    while (spec.types[joinKey(folder, name)]) name = `NewType${i++}`;
    const key = joinKey(folder, name);
    await setSpec({ ...spec, types: { ...spec.types, [key]: { kind: 'object', fields: [] } } });
    setSelected(key);
  }

  async function renameTypeKey(oldKey: string, newKey: string) {
    if (!newKey || spec.types[newKey]) return;
    await setSpec(renameType(spec, oldKey, newKey));
    setSelected(newKey);
  }

  function commitNewFolder() {
    const buffer = creatingBuffer;
    setCreatingBuffer(null);
    if (buffer === null) return;
    const normalized = normalizeFolder(buffer);
    if (normalized === null || !normalized) return;
    if (realFolderPaths.has(normalized) || pendingFolders.includes(normalized)) return;
    // Each sortable row registers a droppable with id = typeKey. Guard against
    // a pending-folder droppable that would collide with that.
    if (typeKeys.includes(normalized)) return;
    setPendingFolders((p) => [...p, normalized]);
  }

  async function handleRenameFolder(oldFolder: string, rawNext: string) {
    const normalized = normalizeFolder(rawNext);
    if (normalized === null) return;
    const next = normalized ?? '';
    if (next === oldFolder) return;
    await setSpec(renameFolder(spec, oldFolder, next));
    // Follow the selection if it pointed at a renamed key.
    if (selected) {
      const s = splitKey(selected);
      if (s.folder === oldFolder) {
        setSelected(joinKey(next || undefined, s.name));
      } else if (s.folder && s.folder.startsWith(`${oldFolder}/`)) {
        const suffix = s.folder.slice(oldFolder.length); // starts with '/'
        const newFolder = next ? next + suffix : suffix.slice(1);
        setSelected(joinKey(newFolder || undefined, s.name));
      }
    }
  }

  async function removeType(key: string) {
    if ((usageIndex[key] ?? []).length > 0) return;
    const { [key]: _, ...rest } = spec.types;
    await setSpec({ ...spec, types: rest });
    if (selected === key) setSelected(Object.keys(rest)[0] ?? null);
  }

  async function handleDuplicateType(key: string) {
    const newKey = await duplicateType(key);
    setSelected(newKey);
  }

  const current = selected ? spec.types[selected] : null;
  const selectedParts = selected ? splitKey(selected) : null;

  return (
    <>
      <CollapsedRail
        label={t('types')}
        icon={<IconCube />}
        side="left"
        onExpand={() => setUiPref('typesCollapsed', false)}
        count={typeKeys.length}
      />

      {!typesCollapsed && (
        <>
          <div className="absolute inset-0 z-20 bg-slate-900/10" onClick={() => setUiPref('typesCollapsed', true)} aria-hidden="true" />
          <section className="absolute left-10 top-0 bottom-0 z-30 flex w-[440px] max-w-[calc(100vw-4rem)] flex-col rounded-r-lg border-y border-r border-slate-200 bg-white shadow-pop text-sm" role="dialog" aria-label={t('types')}>
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <h2 className="panel-title">{t('types')}</h2>
              <div className="flex items-center gap-1">
                <button className="btn-icon" aria-label={t('addTypeTitle')} title={t('addTypeTitle')} onClick={() => void addType()}>
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
                <button className="btn-icon" aria-label={t('closeTypes')} title={t('closeTypesHint')} onClick={() => setUiPref('typesCollapsed', true)}>
                  <IconX />
                </button>
              </div>
            </div>

            <div className="thin-scroll flex-1 overflow-y-auto p-3">
              {broken.length > 0 && (
                <div role="alert" className="mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  <IconAlert className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">{broken.length} {t('brokenRefs')}</div>
                    <ul className="mt-1 space-y-0.5">
                      {broken.map((b, i) => (<li key={i}><span className="font-mono">{b.location}</span>: {b.ref}</li>))}
                    </ul>
                  </div>
                </div>
              )}

              {dndAlert && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
                  data-testid="type-panel-dnd-alert"
                >
                  {dndAlert}
                </div>
              )}

              {typeKeys.length === 0 && pendingFolders.length === 0 && creatingBuffer === null ? (
                <EmptyState t={t} />
              ) : (
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={(e) => void handleDragEnd(e)}
                  onDragCancel={() => setActiveSourceId(null)}
                  accessibility={{ announcements }}
                >
                  <SortableContext items={typeKeys} strategy={verticalListSortingStrategy}>
                    {(anyInFolder || pendingFolders.length > 0 || creatingBuffer !== null) ? (
                      <TreeList
                        node={tree}
                        depth={0}
                        selected={selected}
                        onSelect={setSelected}
                        collapsed={typeFolderCollapsed}
                        onToggleFolder={toggleTypeFolder}
                        onRenameFolder={(p, next) => void handleRenameFolder(p, next)}
                        activeSourceFolder={activeSourceFolder}
                        onExport={onExport}
                        onRemoveType={(k) => void removeType(k)}
                        onDuplicateType={(k) => void handleDuplicateType(k)}
                        onAddType={(folder) => void addTypeInFolder(folder)}
                        usageIndex={usageIndex}
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
                                onAddType={(folder) => void addTypeInFolder(folder)}
                              />
                            ))}
                          </>
                        }
                      />
                    ) : (
                      <FlatList
                        keys={typeKeys}
                        selected={selected}
                        onSelect={setSelected}
                        onExport={onExport}
                        onRemoveType={(k) => void removeType(k)}
                        onDuplicateType={(k) => void handleDuplicateType(k)}
                        usageIndex={usageIndex}
                      />
                    )}
                  </SortableContext>
                </DndContext>
              )}

              {selected && current && selectedParts && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      key={selected}
                      aria-label="Type name"
                      className="input flex-1 font-mono text-xs"
                      defaultValue={selectedParts.name}
                      onBlur={(e) => {
                        const nextName = e.target.value.trim();
                        if (!nextName) { e.target.value = selectedParts.name; return; }
                        void renameTypeKey(selected, joinKey(selectedParts.folder, nextName));
                      }}
                    />
                    <button
                      className="btn-icon text-red-600 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
                      aria-label="delete"
                      title={usages.length > 0 ? t('deleteTypeBlocked', { count: usages.length }) : t('deleteType')}
                      disabled={usages.length > 0}
                      onClick={() => void removeType(selected)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                  {usages.length > 0 && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      <div className="mb-1 font-medium text-slate-600">{t('referencedBy', { count: usages.length })}</div>
                      <ul className="space-y-0.5" aria-label={t('referencedBy', { count: usages.length })}>
                        {usages.map((u) => {
                          const key = u.kind === 'endpoint' ? `ep:${u.endpointId}:${u.label}` : `ty:${u.typeName}:${u.label}`;
                          return (
                            <li key={key}>
                              <button
                                className="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] text-slate-700 hover:bg-white hover:text-brand-700"
                                onClick={() => {
                                  if (u.kind === 'endpoint') { selectEndpoint(u.endpointId); setUiPref('typesCollapsed', true); }
                                  else { setSelected(u.typeName); }
                                }}
                              >{u.label}</button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <TypeBuilder
                    value={current}
                    onChange={(t2) => void setSpec({ ...spec, types: { ...spec.types, [selected]: t2 } })}
                    typeNames={typeKeys.filter((n) => n !== selected)}
                    selectedKey={selected}
                  />
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><IconCube /></div>
      <p className="text-xs text-slate-500">{t('noTypesYet')}</p>
      <p className="text-[11px] text-slate-400">{t('noTypesHint')}</p>
    </div>
  );
}

function FlatList({ keys, selected, onSelect, onExport, onRemoveType, onDuplicateType, usageIndex }: {
  keys: string[];
  selected: string | null;
  onSelect(k: string): void;
  onExport?: (s: TypePanelExportScope) => void;
  onRemoveType(k: string): void;
  onDuplicateType(k: string): void;
  usageIndex: Record<string, readonly unknown[]>;
}) {
  return (
    <ul className="mb-3 space-y-0.5">
      {keys.map((n) => (
        <li key={n}>
          <TypeRow
            k={n}
            label={n}
            selected={selected === n}
            onSelect={() => onSelect(n)}
            onExport={onExport}
            onRemoveType={onRemoveType}
            onDuplicateType={onDuplicateType}
            usages={(usageIndex[n] ?? []).length}
          />
        </li>
      ))}
    </ul>
  );
}

function TreeList({ node, depth, selected, onSelect, collapsed, onToggleFolder, onRenameFolder, activeSourceFolder, onExport, onRemoveType, onDuplicateType, onAddType, usageIndex, extraRootChildren }: {
  node: FolderNode<{ key: string; name: string }>;
  depth: number;
  selected: string | null;
  onSelect(k: string): void;
  collapsed: Record<string, boolean>;
  onToggleFolder(path: string): void;
  onRenameFolder(path: string, next: string): void;
  activeSourceFolder: string | null;
  onExport?: (s: TypePanelExportScope) => void;
  onRemoveType(k: string): void;
  onDuplicateType(k: string): void;
  onAddType?: (folder: string) => void;
  usageIndex: Record<string, readonly unknown[]>;
  extraRootChildren?: ReactNode;
}) {
  // At the root level we also expose a droppable wrapper so types can be
  // dropped back to the top (ungrouped) zone. Nested levels don't need it —
  // their parent folder is a first-class drop zone via FolderRow's header.
  // Also disable the root zone when the dragged item is already at root —
  // same-folder drops are no-ops and shouldn't show a false highlight.
  const isRoot = depth === 0;
  const rootDisabled = !isRoot || activeSourceFolder === '';
  const rootDroppable = useDroppable({ id: TYPE_PANEL_ROOT_ID, disabled: rootDisabled });
  return (
    <ul
      ref={isRoot ? rootDroppable.setNodeRef : undefined}
      className={`mb-3 space-y-0.5 rounded-md ${isRoot && rootDroppable.isOver ? 'ring-2 ring-brand-400' : ''}`}
      data-droppable-root={isRoot ? '' : undefined}
    >
      {isRoot && extraRootChildren}
      {node.items.map((item) => (
        <li key={item.key} style={{ marginLeft: depth * 12 }}>
          <TypeRow
            k={item.key}
            label={item.name}
            selected={selected === item.key}
            onSelect={() => onSelect(item.key)}
            onExport={onExport}
            onRemoveType={onRemoveType}
            onDuplicateType={onDuplicateType}
            usages={(usageIndex[item.key] ?? []).length}
          />
        </li>
      ))}
      {node.children.map((child) => (
        <FolderRow
          key={child.path}
          node={child}
          depth={depth}
          isCollapsed={!!collapsed[child.path]}
          onToggle={() => onToggleFolder(child.path)}
          onRename={(next) => onRenameFolder(child.path, next)}
          activeSourceFolder={activeSourceFolder}
          onExport={onExport}
          onAddType={onAddType}
          renderChildren={
            <TreeList
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggleFolder={onToggleFolder}
              onRenameFolder={onRenameFolder}
              activeSourceFolder={activeSourceFolder}
              onExport={onExport}
              onRemoveType={onRemoveType}
              onDuplicateType={onDuplicateType}
              onAddType={onAddType}
              usageIndex={usageIndex}
            />
          }
        />
      ))}
    </ul>
  );
}

function TypeRow({ k, label, selected, onSelect, onExport, onRemoveType, onDuplicateType, usages }: {
  k: string;
  label: string;
  selected: boolean;
  onSelect(): void;
  onExport?: (s: TypePanelExportScope) => void;
  onRemoveType(k: string): void;
  onDuplicateType(k: string): void;
  usages: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: k });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        {...attributes}
        {...listeners}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition ${selected ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-slate-50 text-slate-700'}`}
        onClick={onSelect}
        data-type-key={k}
      >
        <IconCube className="text-slate-400" />
        <span className="truncate font-mono text-xs">{label}</span>
      </button>
      <div className="pointer-events-none absolute z-[1] right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <TypeRowMenu typeKey={k} usages={usages} onExport={onExport} onRemoveType={onRemoveType} onDuplicateType={onDuplicateType} />
      </div>
    </div>
  );
}

function TypeRowMenu({ typeKey, usages, onExport, onRemoveType, onDuplicateType }: {
  typeKey: string;
  usages: number;
  onExport?: (s: TypePanelExportScope) => void;
  onRemoveType(k: string): void;
  onDuplicateType(k: string): void;
}) {
  const { t } = useTranslation();
  return (
    <OverflowMenu>
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          onExport?.({ kind: 'type', typeKey });
        }}
      >
        {t('export')}
      </MenuItem>
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          onDuplicateType(typeKey);
        }}
      >
        {t('duplicate')}
      </MenuItem>
      <MenuItem
        danger
        disabled={usages > 0}
        onClick={(e) => {
          e.stopPropagation();
          if (usages > 0) return;
          onRemoveType(typeKey);
        }}
      >
        {t('delete')}
      </MenuItem>
    </OverflowMenu>
  );
}

function FolderRow({ node, depth, isCollapsed, onToggle, onRename, renderChildren, activeSourceFolder, onExport, onAddType }: {
  node: FolderNode<unknown>;
  depth: number;
  isCollapsed: boolean;
  onToggle(): void;
  onRename(next: string): void;
  renderChildren: ReactNode;
  activeSourceFolder: string | null;
  onExport?: (s: TypePanelExportScope) => void;
  onAddType?: (folder: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(node.name);
  // Disable the folder droppable when the dragged item already lives in this
  // folder — dropping on your own folder is a no-op, so don't show a false
  // "drop here" highlight (or accept the drop via keyboard).
  const droppable = useDroppable({
    id: node.path,
    disabled: activeSourceFolder === node.path,
  });
  function commitRename() {
    if (buffer.includes('/')) { setBuffer(node.name); setEditing(false); return; }
    setEditing(false);
    onRename(buildReplacement(node.path, buffer));
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
            onClick={onToggle}
          >
            {isCollapsed ? <IconChevronRight /> : <IconChevronDown />}
            <span className="truncate">{node.name}</span>
            <span className="ml-auto text-[10px] font-normal text-slate-400">{node.totalCount}</span>
          </button>
        )}
        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            className="btn-icon"
            aria-label={t('addTypeToFolder')}
            title={t('addTypeToFolder')}
            onClick={(e) => { e.stopPropagation(); onAddType?.(node.path); }}
          >
            <IconPlus />
          </button>
          <FolderRowMenu
            node={node}
            onExport={onExport}
            onRename={() => { setBuffer(node.name); setEditing(true); }}
          />
        </div>
      </div>
      {!isCollapsed && renderChildren}
    </li>
  );
}

function FolderRowMenu({ node, onExport, onRename }: {
  node: FolderNode<unknown>;
  onExport?: (s: TypePanelExportScope) => void;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const deleteTypeFolder = useSpecStore((s) => s.deleteTypeFolder);
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
        onClick={async (e) => {
          e.stopPropagation();
          if (!confirm(t('deleteTypeFolderConfirm', { path: node.path, count: node.totalCount }))) return;
          const r = await deleteTypeFolder(node.path);
          if (!r.ok) alert(t('deleteTypeFolderInUse', { items: r.usedBy.join(', ') }));
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

function PendingFolderRow({ path, activeSourceFolder, onRemove, onAddType }: {
  path: string;
  activeSourceFolder: string | null;
  onRemove(): void;
  onAddType?: (folder: string) => void;
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
            aria-label={t('addTypeToFolder')}
            title={t('addTypeToFolder')}
            onClick={(e) => { e.stopPropagation(); onAddType?.(path); }}
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
