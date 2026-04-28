import { create } from 'zustand';
import {
  Spec,
  emptySpec,
  renameType,
  splitKey,
  joinKey,
  collectRefsFromType,
  collectRefsFromEndpoint,
  nextAvailableTypeName,
  type TypeDef,
} from '@zwaggen/core';
import { getStorage, type FileRef } from '../storage/spec-storage';
import { clearEndpointHistory, reconcileHistory } from '../storage/history';

/**
 * Result returned by folder-mutation actions. Callers (UI) react to
 * `reason: 'collision'` by surfacing a localized aria-live banner; other
 * non-ok branches (`unknown` / `noop`) are silent because the state is
 * already what the user expects.
 */
export type SetFolderResult =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'noop' | 'collision' };

interface SpecStore {
  spec: Spec;
  fileHandle: FileRef | null;
  dirty: boolean;
  selectedEndpointId: string | null;
  setSpec(next: Spec): Promise<void>;
  replaceSpec(next: Spec, handle: FileRef | null): Promise<void>;
  newSpec(): Promise<void>;
  markSaved(handle: FileRef | null): Promise<void>;
  restoreDraft(): Promise<boolean>;
  discardDraft(): Promise<{ reloadedFromFile: boolean }>;
  selectEndpoint(id: string | null): void;
  deleteEndpoint(id: string): Promise<void>;
  setTypeFolder(typeKey: string, folder: string | null): Promise<SetFolderResult>;
  setEndpointFolder(endpointId: string, folder: string | null): Promise<SetFolderResult>;
  /** Cascade-delete every endpoint whose folder equals `path` or starts with `path/`. No-op when nothing matches. */
  deleteEndpointFolder(path: string): Promise<void>;
  /**
   * Cascade-delete every type whose key sits under `path` (canonical
   * folder prefix). Returns `{ ok: false, reason: 'inUse', usedBy }` when
   * any type or endpoint outside the folder still references one of the
   * to-be-removed types — caller surfaces a localized message and aborts.
   */
  deleteTypeFolder(path: string): Promise<{ ok: true } | { ok: false; reason: 'inUse'; usedBy: string[] }>;
  /** Inserts a fresh-id deep-clone of `id` immediately after the source. Selects the new endpoint. */
  duplicateEndpoint(id: string): Promise<string>;
  /** Inserts a deep-clone under a `{name}Copy[N]` key in the same folder, immediately after the source key. */
  duplicateType(key: string): Promise<string>;
}

export const useSpecStore = create<SpecStore>((set, get) => ({
  spec: emptySpec(),
  fileHandle: null,
  dirty: false,
  selectedEndpointId: null,
  async setSpec(next) {
    set({ spec: next, dirty: true });
    await getStorage().saveDraft(next);
  },
  async replaceSpec(next, handle) {
    set({ spec: next, fileHandle: handle, dirty: false });
    await getStorage().clearDraft();
    await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
  },
  async newSpec() {
    set({ spec: emptySpec(), fileHandle: null, dirty: false, selectedEndpointId: null });
    await getStorage().clearDraft();
    await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
  },
  async markSaved(handle) {
    // Clear the draft FIRST so a tab close mid-flow doesn't leave us with
    // dirty=false + a stale draft (which would re-restore on next boot).
    await getStorage().clearDraft();
    set({ fileHandle: handle, dirty: false });
  },
  async restoreDraft() {
    const draft = await getStorage().loadDraft();
    if (!draft) return false;
    set({ spec: draft, dirty: true });
    return true;
  },
  async discardDraft() {
    await getStorage().clearDraft();
    const handle = get().fileHandle;
    if (handle) {
      const { fromJSON } = await import('@zwaggen/core');
      const { text } = await getStorage().readFile(handle);
      set({ spec: fromJSON(JSON.parse(text)), dirty: false });
      await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
      return { reloadedFromFile: true };
    }
    // no file handle: reset to an empty spec (caller may prompt "Open")
    set({ spec: emptySpec(), dirty: false, selectedEndpointId: null });
    await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
    return { reloadedFromFile: false };
  },
  async deleteEndpoint(id) {
    const spec = get().spec;
    const next = { ...spec, endpoints: spec.endpoints.filter((e) => e.id !== id) };
    await get().setSpec(next);
    if (get().selectedEndpointId === id) set({ selectedEndpointId: null });
    await clearEndpointHistory(id);
  },
  async deleteEndpointFolder(path) {
    const spec = get().spec;
    // Match the exact folder and any nested subfolder. Mirrors the
    // folderMatchesPrefix semantics in @zwaggen/core, scoped to the cascade.
    const inFolder = (folder?: string): boolean =>
      folder === path || (folder?.startsWith(path + '/') ?? false);
    const removed = spec.endpoints.filter((e) => inFolder(e.folder));
    if (removed.length === 0) return;
    const next = { ...spec, endpoints: spec.endpoints.filter((e) => !inFolder(e.folder)) };
    await get().setSpec(next);
    const selectedId = get().selectedEndpointId;
    if (selectedId && removed.some((e) => e.id === selectedId)) {
      set({ selectedEndpointId: null });
    }
    for (const e of removed) await clearEndpointHistory(e.id);
  },
  async deleteTypeFolder(path) {
    const spec = get().spec;
    const inFolder = (key: string): boolean => key === path || key.startsWith(path + '/');
    const removedKeys = Object.keys(spec.types).filter(inFolder);
    if (removedKeys.length === 0) return { ok: true };

    const removedSet = new Set(removedKeys);
    const usedBy: string[] = [];

    // Outside types referencing any soon-to-be-removed key
    for (const [k, def] of Object.entries(spec.types)) {
      if (removedSet.has(k)) continue;
      const refs = new Set<string>();
      collectRefsFromType(def, refs);
      for (const r of refs) {
        if (removedSet.has(r)) {
          usedBy.push(`type ${k}`);
          break;
        }
      }
    }
    // Endpoints referencing any soon-to-be-removed key
    for (const ep of spec.endpoints) {
      const refs = new Set<string>();
      collectRefsFromEndpoint(ep, refs);
      for (const r of refs) {
        if (removedSet.has(r)) {
          usedBy.push(`endpoint ${ep.id}`);
          break;
        }
      }
    }

    if (usedBy.length > 0) return { ok: false, reason: 'inUse', usedBy };

    const newTypes: Record<string, TypeDef> = {};
    for (const [k, v] of Object.entries(spec.types)) {
      if (!removedSet.has(k)) newTypes[k] = v;
    }
    const next = { ...spec, types: newTypes };
    await get().setSpec(next);
    return { ok: true };
  },
  async duplicateEndpoint(id) {
    const spec = get().spec;
    const idx = spec.endpoints.findIndex((e) => e.id === id);
    if (idx < 0) return id;
    const newId = crypto.randomUUID();
    const copy = structuredClone(spec.endpoints[idx]!);
    copy.id = newId;
    const next = {
      ...spec,
      endpoints: [...spec.endpoints.slice(0, idx + 1), copy, ...spec.endpoints.slice(idx + 1)],
    };
    await get().setSpec(next);
    set({ selectedEndpointId: newId });
    return newId;
  },
  async duplicateType(key) {
    const spec = get().spec;
    const def = spec.types[key];
    if (!def) return key;
    const { folder, name } = splitKey(key);
    const newName = nextAvailableTypeName(spec, name, folder);
    const newKey = joinKey(folder, newName);
    const newTypes: Record<string, TypeDef> = {};
    for (const [k, v] of Object.entries(spec.types)) {
      newTypes[k] = v;
      if (k === key) newTypes[newKey] = structuredClone(def);
    }
    const next = { ...spec, types: newTypes };
    await get().setSpec(next);
    return newKey;
  },
  selectEndpoint(id) {
    set({ selectedEndpointId: id });
  },
  async setTypeFolder(typeKey, folder) {
    const spec = get().spec;
    if (!spec.types[typeKey]) return { ok: false, reason: 'unknown' };
    const { name } = splitKey(typeKey);
    const newFolder = folder ?? undefined;
    const newKey = joinKey(newFolder, name);
    if (newKey === typeKey) return { ok: false, reason: 'noop' };
    if (spec.types[newKey]) return { ok: false, reason: 'collision' };
    const next = renameType(spec, typeKey, newKey);
    await get().setSpec(next);
    return { ok: true };
  },
  async setEndpointFolder(endpointId, folder) {
    const spec = get().spec;
    const idx = spec.endpoints.findIndex((e) => e.id === endpointId);
    if (idx < 0) return { ok: false, reason: 'unknown' };
    const current = spec.endpoints[idx]!;
    const nextFolder = folder ?? undefined;
    if ((current.folder ?? undefined) === nextFolder) return { ok: false, reason: 'noop' };
    // Endpoints are keyed by id, not name, so there's no collision branch
    // here — kept symmetrical with setTypeFolder for the SpecStore interface.
    const nextEp = { ...current };
    if (nextFolder === undefined) delete nextEp.folder;
    else nextEp.folder = nextFolder;
    const endpoints = spec.endpoints.slice();
    endpoints[idx] = nextEp;
    await get().setSpec({ ...spec, endpoints });
    return { ok: true };
  },
}));
