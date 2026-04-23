import { create } from 'zustand';
import { Spec, emptySpec, renameType, splitKey, joinKey } from '@zwaggen/core';
import { getStorage, type FileRef } from '../storage/spec-storage';
import { clearEndpointHistory, reconcileHistory } from '../storage/history';

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
  setTypeFolder(typeKey: string, folder: string | null): Promise<void>;
  setEndpointFolder(endpointId: string, folder: string | null): Promise<void>;
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
    if (!spec.types[typeKey]) return;
    const { name } = splitKey(typeKey);
    const newFolder = folder ?? undefined;
    const newKey = joinKey(newFolder, name);
    if (newKey === typeKey) return;
    if (spec.types[newKey]) return; // collision: silently no-op.
    const next = renameType(spec, typeKey, newKey);
    await get().setSpec(next);
  },
  async setEndpointFolder(endpointId, folder) {
    const spec = get().spec;
    const idx = spec.endpoints.findIndex((e) => e.id === endpointId);
    if (idx < 0) return;
    const current = spec.endpoints[idx]!;
    const nextFolder = folder ?? undefined;
    if ((current.folder ?? undefined) === nextFolder) return;
    const nextEp = { ...current };
    if (nextFolder === undefined) delete nextEp.folder;
    else nextEp.folder = nextFolder;
    const endpoints = spec.endpoints.slice();
    endpoints[idx] = nextEp;
    await get().setSpec({ ...spec, endpoints });
  },
}));
