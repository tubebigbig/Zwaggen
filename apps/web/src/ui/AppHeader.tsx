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
    <header className="flex items-center gap-2 border-b bg-white px-4 py-2">
      <h1 className="mr-auto text-lg font-semibold">
        gen-spec — <span className="font-normal">{spec.info.name}</span>
        {dirty && (
          <span className="ml-1 text-amber-600" aria-label="unsaved changes">
            •
          </span>
        )}
      </h1>
      <button className="rounded border px-2 py-1" onClick={() => void newSpec()}>
        New
      </button>
      <button className="rounded border px-2 py-1" onClick={() => void openSpec()}>
        Open
      </button>
      {dirty && (
        <button className="rounded border px-2 py-1" onClick={() => void onDiscard()}>
          Discard draft
        </button>
      )}
      <button
        className="rounded border bg-slate-900 px-2 py-1 text-white"
        onClick={() => void saveSpec()}
      >
        Save
      </button>
      <ExportMenu />
    </header>
  );
}
