import 'fake-indexeddb/auto';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LivePreviewPanel } from '../../src/ui/LivePreviewPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';

function preText(): string {
  return document.querySelector('pre')?.textContent ?? '';
}

function withType(typeName: string): Spec {
  const s = emptySpec();
  s.types[typeName] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  return s;
}

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(withType('User'), null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('renders 4 tabs and TS by default', () => {
  render(<LivePreviewPanel />);
  expect(screen.getByRole('tab', { name: /^types\.ts$/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^schemas\.ts$/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^client\.ts$/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^openapi\.json$/i })).toBeInTheDocument();
  expect(preText()).toMatch(/(interface|type)\s+User/);
});

it('switching to schemas.ts shows zod output', async () => {
  render(<LivePreviewPanel />);
  await userEvent.click(screen.getByRole('tab', { name: /^schemas\.ts$/i }));
  expect(preText()).toContain('UserSchema');
});

it('switching to openapi.json shows valid JSON', async () => {
  render(<LivePreviewPanel />);
  await userEvent.click(screen.getByRole('tab', { name: /^openapi\.json$/i }));
  const text = preText();
  expect(() => JSON.parse(text)).not.toThrow();
  expect(text).toContain('"User"');
});

it('spec change eventually updates output after debounce', async () => {
  // Don't use fake timers — IndexedDB / replaceSpec async hooks hang under
  // them. Instead just wait the real debounce window. (300ms in source.)
  render(<LivePreviewPanel />);
  await act(async () => {
    await useSpecStore.getState().replaceSpec(withType('Account'), null);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  expect(preText()).toMatch(/(interface|type)\s+Account/);
});

it('codegen error shows in pane without crashing', async () => {
  // Seed a key collision: 'auth/User' and 'auth_User' both sanitize to 'auth_User'.
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['auth_User'] = { kind: 'object', fields: [] };
  await useSpecStore.getState().replaceSpec(spec, null);
  render(<LivePreviewPanel />);
  expect(preText()).toMatch(/Codegen failed/);
  expect(screen.getByRole('complementary')).toBeInTheDocument();
});
