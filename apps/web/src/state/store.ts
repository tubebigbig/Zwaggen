import { create } from 'zustand';
import { Spec } from '../schema/types';
import { emptySpec } from '../schema/defaults';
import { clearDraft, loadDraft, saveDraft } from '../storage/drafts';
import { FileHandle } from '../storage/file';
import { clearEndpointHistory, reconcileHistory } from '../storage/history';

interface SpecStore {
  spec: Spec;
  fileHandle: FileHandle | null;
  dirty: boolean;
  selectedEndpointId: string | null;
  setSpec(next: Spec): Promise<void>;
  replaceSpec(next: Spec, handle: FileHandle | null): Promise<void>;
  newSpec(): Promise<void>;
  markSaved(handle: FileHandle | null): Promise<void>;
  restoreDraft(): Promise<boolean>;
  discardDraft(): Promise<{ reloadedFromFile: boolean }>;
  selectEndpoint(id: string | null): void;
  deleteEndpoint(id: string): Promise<void>;
}

export const useSpecStore = create<SpecStore>((set, get) => ({
  spec: emptySpec(),
  fileHandle: null,
  dirty: false,
  selectedEndpointId: null,
  async setSpec(next) {
    set({ spec: next, dirty: true });
    await saveDraft(next);
  },
  async replaceSpec(next, handle) {
    set({ spec: next, fileHandle: handle, dirty: false });
    await clearDraft();
    await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
  },
  async newSpec() {
    set({ spec: emptySpec(), fileHandle: null, dirty: false, selectedEndpointId: null });
    await clearDraft();
    await reconcileHistory(new Set(get().spec.endpoints.map((e) => e.id)));
  },
  async markSaved(handle) {
    set({ fileHandle: handle, dirty: false });
    await clearDraft();
  },
  async restoreDraft() {
    const draft = await loadDraft();
    if (!draft) return false;
    set({ spec: draft, dirty: true });
    return true;
  },
  async discardDraft() {
    await clearDraft();
    const handle = get().fileHandle;
    if (handle) {
      // lazy-import to avoid a cycle with AppHeader
      const { readFile } = await import('../storage/file');
      const { fromJSON } = await import('../schema/serialize');
      const { text } = await readFile(handle);
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
}));
