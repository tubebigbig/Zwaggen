import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ExportPopover } from '../../src/ui/ExportPopover';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec, type RefType } from '@zwaggen/core';

function preText(): string {
  return document.querySelector('pre')?.textContent ?? '';
}

function fixture(): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.types['auth/User'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  s.types['Public'] = {
    kind: 'object',
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  s.endpoints = [
    {
      id: 'getAuthUser',
      method: 'GET',
      path: '/auth/user',
      pathParams: [],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'auth/User' } as RefType }],
      auth: 'inherit',
      useProxy: 'inherit',
      folder: 'auth',
    },
    {
      id: 'getPublic',
      method: 'GET',
      path: '/public',
      pathParams: [],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'Public' } as RefType }],
      auth: 'inherit',
      useProxy: 'inherit',
    },
  ];
  return s;
}

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(fixture(), null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('folder scope renders 4 tabs', () => {
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /types\.ts/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /schemas\.ts/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /client\.ts/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /openapi\.json/i })).toBeInTheDocument();
});

it('types.ts (default tab) emits the in-folder type only', () => {
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={vi.fn()} />);
  expect(preText()).toContain('auth_User');
  expect(preText()).not.toContain('Public');
});

it('client.ts emits the in-folder endpoint method', async () => {
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /client\.ts/i }));
  expect(preText()).toContain('getAuthUser');
  expect(preText()).not.toContain('getPublic');
});

it('openapi.json is valid JSON containing only the in-folder path', async () => {
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /openapi\.json/i }));
  const text = preText();
  expect(text).toContain('"/auth/user"');
  expect(text).not.toContain('"/public"');
  expect(() => JSON.parse(text)).not.toThrow();
});

it('nested folder uses leaf segment in filenames', () => {
  // For prefix 'auth/oauth', filenames should start with 'oauth.'
  // (visible via the filename label in the Pane header)
  render(<ExportPopover scope={{ kind: 'folder', prefix: 'auth/oauth' }} onClose={vi.fn()} />);
  expect(screen.getByText(/^oauth\.types\.ts$/)).toBeInTheDocument();
});
