import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { IconAlert, IconChevronDown, IconChevronRight, IconCube, IconPencil, IconPlus, IconTrash, IconX } from './icons';
import { setUiPref, toggleTypeFolder, useUiPrefs } from '../state/uiPrefs';
import { CollapsedRail } from './CollapsedRail';
import { FolderInput } from './FolderInput';

interface TypeItem { key: string; folder: string | undefined; name: string }

export function TypePanel() {
  const { t } = useTranslation();
  const { spec, setSpec, selectEndpoint } = useSpecStore();
  const { typesCollapsed, typeFolderCollapsed } = useUiPrefs();
  const typeKeys = Object.keys(spec.types).sort();
  const anyInFolder = typeKeys.some((k) => k.includes('/'));

  const items: TypeItem[] = useMemo(() =>
    typeKeys.map((k) => { const s = splitKey(k); return { key: k, folder: s.folder, name: s.name }; }),
    [typeKeys.join('|')]);

  const tree = useMemo(() => groupByFolder(items, (i) => i.folder), [items]);

  const [selected, setSelected] = useState<string | null>(typeKeys[0] ?? null);
  const broken = collectBrokenRefs(spec);
  const usageIndex = useMemo(() => buildUsageIndex(spec), [spec]);
  const usages = selected ? (usageIndex[selected] ?? []) : [];

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

  async function renameTypeKey(oldKey: string, newKey: string) {
    if (!newKey || spec.types[newKey]) return;
    await setSpec(renameType(spec, oldKey, newKey));
    setSelected(newKey);
  }

  async function moveToFolder(oldKey: string, nextFolder: string | undefined) {
    const { name } = splitKey(oldKey);
    const newKey = joinKey(nextFolder, name);
    if (newKey === oldKey) return;
    if (spec.types[newKey]) return; // collision — silently no-op; UI could surface a toast later.
    await renameTypeKey(oldKey, newKey);
  }

  async function handleRenameFolder(oldFolder: string, rawNext: string) {
    const normalized = normalizeFolder(rawNext);
    if (normalized === null) return; // invalid, rejected by FolderInput UI
    const next = normalized ?? ''; // empty means "move everything to root"
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

              {typeKeys.length === 0 ? (
                <EmptyState t={t} />
              ) : anyInFolder ? (
                <TreeList
                  node={tree}
                  depth={0}
                  selected={selected}
                  onSelect={setSelected}
                  collapsed={typeFolderCollapsed}
                  onToggleFolder={toggleTypeFolder}
                  onRenameFolder={(p, next) => void handleRenameFolder(p, next)}
                />
              ) : (
                <FlatList keys={typeKeys} selected={selected} onSelect={setSelected} />
              )}

              {selected && current && selectedParts && (
                <div className="mt-3 space-y-2">
                  <FolderInput
                    value={selectedParts.folder}
                    onChange={(next) => void moveToFolder(selected, next)}
                  />
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

function FlatList({ keys, selected, onSelect }: { keys: string[]; selected: string | null; onSelect(k: string): void }) {
  return (
    <ul className="mb-3 space-y-0.5">
      {keys.map((n) => (
        <li key={n}><TypeRow k={n} label={n} selected={selected === n} onSelect={() => onSelect(n)} /></li>
      ))}
    </ul>
  );
}

function TreeList({ node, depth, selected, onSelect, collapsed, onToggleFolder, onRenameFolder }: {
  node: FolderNode<{ key: string; name: string }>;
  depth: number;
  selected: string | null;
  onSelect(k: string): void;
  collapsed: Record<string, boolean>;
  onToggleFolder(path: string): void;
  onRenameFolder(path: string, next: string): void;
}) {
  return (
    <ul className="mb-3 space-y-0.5">
      {node.items.map((item) => (
        <li key={item.key} style={{ marginLeft: depth * 12 }}>
          <TypeRow k={item.key} label={item.name} selected={selected === item.key} onSelect={() => onSelect(item.key)} />
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
          renderChildren={
            <TreeList
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggleFolder={onToggleFolder}
              onRenameFolder={onRenameFolder}
            />
          }
        />
      ))}
    </ul>
  );
}

function TypeRow({ k, label, selected, onSelect }: { k: string; label: string; selected: boolean; onSelect(): void }) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition ${selected ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-slate-50 text-slate-700'}`}
      onClick={onSelect}
      data-type-key={k}
    >
      <IconCube className="text-slate-400" />
      <span className="truncate font-mono text-xs">{label}</span>
    </button>
  );
}

function FolderRow({ node, depth, isCollapsed, onToggle, onRename, renderChildren }: {
  node: FolderNode<unknown>;
  depth: number;
  isCollapsed: boolean;
  onToggle(): void;
  onRename(next: string): void;
  renderChildren: ReactNode;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(node.name);
  function commitRename() {
    if (buffer.includes('/')) { setBuffer(node.name); setEditing(false); return; }
    setEditing(false);
    onRename(buildReplacement(node.path, buffer));
  }

  return (
    <li style={{ marginLeft: depth * 12 }}>
      <div className="group flex items-center gap-1">
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
      {!isCollapsed && renderChildren}
    </li>
  );
}

/** Build the target folder for a rename: swap the last segment of `oldPath` with `newSegment`. */
function buildReplacement(oldPath: string, newSegment: string): string {
  const i = oldPath.lastIndexOf('/');
  return i < 0 ? newSegment : `${oldPath.slice(0, i)}/${newSegment}`;
}
