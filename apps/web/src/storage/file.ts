export type FileHandle = FileSystemFileHandle;

export function supportsFileSystemAccess(): boolean {
  return typeof (globalThis as any).showOpenFilePicker === 'function';
}

export async function pickOpen(): Promise<FileHandle | null> {
  try {
    const [handle] = await (globalThis as any).showOpenFilePicker({
      types: [{ description: 'Zwaggen JSON', accept: { 'application/json': ['.json', '.zwaggen.json'] } }],
      multiple: false,
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function pickSave(suggestedName = 'spec.zwaggen.json'): Promise<FileHandle | null> {
  try {
    const handle = await (globalThis as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Zwaggen JSON', accept: { 'application/json': ['.json', '.zwaggen.json'] } }],
    });
    return handle ?? null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function readFile(handle: FileHandle): Promise<{ text: string; name: string }> {
  const f = await handle.getFile();
  return { text: await f.text(), name: f.name };
}

export async function writeFile(text: string, handle: FileHandle): Promise<void> {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function uploadFile(accept = '.json,.zwaggen.json,application/json'): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      try {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const text = await f.text();
        resolve({ text, name: f.name });
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}
