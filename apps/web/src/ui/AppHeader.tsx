import { useSpecStore } from '../state/store';
import { fromJSON, toJSON, stripSecrets, extractSecrets } from '../schema/serialize';
import { collectBrokenRefs } from '../schema/rename';
import { saveSecrets, loadSecrets } from '../storage/drafts';
import type { Spec } from '../schema/types';
import {
  downloadBlob,
  pickOpen,
  pickSave,
  readFile,
  supportsFileSystemAccess,
  uploadFile,
  writeFile,
} from '../storage/file';
import { ExportMenu } from './ExportMenu';
import { IconFile, IconFolder, IconSave, IconX } from './icons';

export function AppHeader() {
  const { spec, fileHandle, dirty, replaceSpec, newSpec, markSaved, discardDraft } =
    useSpecStore();

  async function openSpec() {
    async function hydrateSecrets(parsed: Spec): Promise<Spec> {
      const store = await loadSecrets();
      const envs: typeof parsed.environments = {};
      for (const [name, env] of Object.entries(parsed.environments)) {
        const known = store[name] ?? {};
        envs[name] = {
          variables: env.variables.map((v) =>
            v.secret && !v.value && known[v.name] ? { ...v, value: known[v.name]! } : v,
          ),
        };
      }
      return { ...parsed, environments: envs };
    }
    if (supportsFileSystemAccess()) {
      const h = await pickOpen();
      if (!h) return;
      const { text } = await readFile(h);
      await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(text))), h);
    } else {
      const up = await uploadFile();
      if (!up) return;
      await replaceSpec(await hydrateSecrets(fromJSON(JSON.parse(up.text))), null);
    }
  }

  async function saveSpec() {
    const broken = collectBrokenRefs(spec);
    if (broken.length > 0) {
      alert(`Cannot save: ${broken.length} broken type reference(s). Fix them in the Types panel.`);
      return;
    }
    const onDisk = stripSecrets(spec);
    const existing = await loadSecrets();
    await saveSecrets({ ...existing, ...extractSecrets(spec) });
    const text = toJSON(onDisk);
    if (fileHandle) {
      await writeFile(text, fileHandle);
      await markSaved(fileHandle);
      return;
    }
    if (supportsFileSystemAccess()) {
      const h = await pickSave();
      if (!h) return;
      await writeFile(text, h);
      await markSaved(h);
    } else {
      downloadBlob(new Blob([text], { type: 'application/json' }), 'spec.gen-spec.json');
      await markSaved(null);
    }
  }

  async function onDiscard() {
    if (!confirm('Discard unsaved changes and reload from the source file?')) return;
    const { reloadedFromFile } = await discardDraft();
    if (!reloadedFromFile) {
      alert('No source file attached — draft cleared and spec reset. Use "Open" to load one.');
    }
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mr-auto flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 3 4 8 5-5 5 15H2Z" />
          </svg>
        </div>
        <h1 className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">gen-spec</span>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-700">{spec.info.name}</span>
          {dirty && (
            <span
              aria-label="unsaved changes"
              className="chip bg-amber-100 text-amber-800"
            >
              unsaved
            </span>
          )}
        </h1>
      </div>
      <button className="btn" onClick={() => void newSpec()}>
        <IconFile />
        New
      </button>
      <button className="btn" onClick={() => void openSpec()}>
        <IconFolder />
        Open
      </button>
      {dirty && (
        <button className="btn" onClick={() => void onDiscard()}>
          <IconX />
          Discard draft
        </button>
      )}
      <button className="btn-primary" onClick={() => void saveSpec()}>
        <IconSave />
        Save
      </button>
      <ExportMenu />
    </header>
  );
}
