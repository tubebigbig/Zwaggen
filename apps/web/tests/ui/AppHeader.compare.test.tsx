import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { toJSON } from '../../src/schema/serialize';

vi.mock('../../src/storage/file', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/file')>();
  return {
    ...actual,
    supportsFileSystemAccess: () => false,
    uploadFile: vi.fn(),
  };
});

async function getUploadFileMock() {
  const mod = await import('../../src/storage/file');
  return mod.uploadFile as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
});

test('Happy path: clicking Compare with valid .zwaggen.json opens DiffPanel', async () => {
  const uploadFile = await getUploadFileMock();
  const otherSpec = emptySpec('Other API');
  uploadFile.mockResolvedValue({ text: toJSON(otherSpec), name: 'other.zwaggen.json' });

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

  expect(screen.getByRole('dialog', { name: /Spec changes/i })).toBeTruthy();
});

test('Invalid JSON: alerts user and DiffPanel does not open', async () => {
  const uploadFile = await getUploadFileMock();
  uploadFile.mockResolvedValue({ text: 'not json at all', name: 'bad.json' });
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

  expect(alertSpy).toHaveBeenCalledWith(
    'Could not parse — expected a .zwaggen.json file.',
  );
  expect(screen.queryByRole('dialog', { name: /Spec changes/i })).toBeNull();

  alertSpy.mockRestore();
});
