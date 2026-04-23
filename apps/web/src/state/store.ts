import { create } from 'zustand';
import { Spec, emptySpec, renameType, splitKey, joinKey } from '@zwaggen/core';
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
    set({ fileHandle: handle, dirty: false });
    await getStorage().clearDraft();
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
