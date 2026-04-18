import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../../src/ui/AppHeader';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';

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

const validDoc = {
  openapi: '3.1.0',
  info: { title: 'Test' },
  components: {
    schemas: {
      User: { type: 'object', properties: { id: { type: 'string' } } },
    },
  },
};

const docWithWarning = {
  openapi: '3.1.0',
  info: { title: 'Warn Test' },
  components: {
    schemas: {
      Mixed: { anyOf: [{ type: 'string' }, { type: 'number' }] },
    },
  },
};

beforeEach(() => {
  useSpecStore.setState({ spec: emptySpec(), fileHandle: null, dirty: false });
});

test('Happy path: imports spec and populates store types', async () => {
  const uploadFile = await getUploadFileMock();
  uploadFile.mockResolvedValue({ text: JSON.stringify(validDoc), name: 'test.json' });

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Import OpenAPI' }));

  expect(useSpecStore.getState().spec.types['User']).toBeDefined();
});

test('Warning banner renders when import has warnings', async () => {
  const uploadFile = await getUploadFileMock();
  uploadFile.mockResolvedValue({ text: JSON.stringify(docWithWarning), name: 'warn.json' });

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Import OpenAPI' }));

  const alert = screen.getByRole('alert');
  expect(alert).toBeTruthy();
  expect(alert.textContent).toMatch(/warning/i);
});

test('Dismiss button clears the warning banner', async () => {
  const uploadFile = await getUploadFileMock();
  uploadFile.mockResolvedValue({ text: JSON.stringify(docWithWarning), name: 'warn.json' });

  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Import OpenAPI' }));
  expect(screen.getByRole('alert')).toBeTruthy();

  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('Invalid JSON: alerts user and leaves store unchanged', async () => {
  const uploadFile = await getUploadFileMock();
  uploadFile.mockResolvedValue({ text: 'not json at all', name: 'bad.json' });
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

  const initialTypes = useSpecStore.getState().spec.types;
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Import OpenAPI' }));

  expect(alertSpy).toHaveBeenCalledWith('Could not parse file — expected JSON.');
  expect(useSpecStore.getState().spec.types).toEqual(initialTypes);

  alertSpy.mockRestore();
});
