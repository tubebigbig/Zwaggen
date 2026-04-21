import { describe, expect, it, vi, afterEach } from 'vitest';
import { uploadFile } from '../../src/storage/file';

afterEach(() => {
  vi.restoreAllMocks();
});

function installFakePicker(file: File | null) {
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'input') {
      el.click = () => {
        Object.defineProperty(el, 'files', {
          value: file ? [file] : [],
          configurable: true,
        });
        el.dispatchEvent(new Event('change'));
      };
    }
    return el;
  }) as typeof document.createElement);
}

describe('uploadFile — onchange error handling', () => {
  it('resolves null when no file is selected', async () => {
    installFakePicker(null);
    await expect(uploadFile()).resolves.toBeNull();
  });

  it('resolves { text, name } when the file reads successfully', async () => {
    const file = new File(['{"ok":true}'], 'spec.zwaggen.json', { type: 'application/json' });
    installFakePicker(file);
    await expect(uploadFile()).resolves.toEqual({ text: '{"ok":true}', name: 'spec.zwaggen.json' });
  });

  it('rejects when the selected file.text() rejects', async () => {
    const ioError = new Error('FileReader: permission revoked');
    const fakeFile = {
      name: 'locked.json',
      text: () => Promise.reject(ioError),
    } as unknown as File;
    installFakePicker(fakeFile);
    await expect(uploadFile()).rejects.toBe(ioError);
  });
});
