import { useSpecStore } from '../state/store';
import { fromJSON, toJSON } from '../schema/serialize';
import {
  downloadBlob,
  pickOpen,
  pickSave,
  readFile,
  supportsFileSystemAccess,
  uploadFile,
  writeFile,
} from '../storage/file';

export function AppHeader() {
  const { spec, fileHandle, dirty, replaceSpec, newSpec, markSaved, discardDraft } =
    useSpecStore();

  async function openSpec() {
    if (supportsFileSystemAccess()) {
      const h = await pickOpen();
      if (!h) return;
      const { text } = await readFile(h);
      await replaceSpec(fromJSON(JSON.parse(text)), h);
    } else {
      const up = await uploadFile();
      if (!up) return;
      await replaceSpec(fromJSON(JSON.parse(up.text)), null);
    }
  }

  async function saveSpec() {
    const text = toJSON(spec);
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
    </header>
  );
}
