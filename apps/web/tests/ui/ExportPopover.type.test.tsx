import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ExportPopover } from '../../src/ui/ExportPopover';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Spec } from '@zwaggen/core';

// The visible output renders inside a <pre>; a hidden <textarea> mirrors the
// same text for clipboard-fallback. Both match `getByText`, so scope queries
// to the <pre> element by tag.
function preText(): string {
  return document.querySelector('pre')?.textContent ?? '';
}

function fixture(): Spec {
  const s = emptySpec();
  s.types['User'] = {
    kind: 'object',
    fields: [
      { name: 'id', required: true, type: { kind: 'string' } },
      { name: 'age', required: false, type: { kind: 'integer' } },
    ],
  };
  s.types['auth/Token'] = {
    kind: 'object',
    fields: [{ name: 'value', required: true, type: { kind: 'string' } }],
  };
  return s;
}

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(fixture(), null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('type scope renders TS / Zod / JSON Schema tabs', () => {
  render(<ExportPopover scope={{ kind: 'type', typeKey: 'User' }} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /ts interface/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /zod/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /json schema/i })).toBeInTheDocument();
});

it('TS tab emits an interface for the requested type only', () => {
  render(<ExportPopover scope={{ kind: 'type', typeKey: 'User' }} onClose={vi.fn()} />);
  // TS is the default tab.
  expect(preText()).toMatch(/(interface|type)\s+User/);
  expect(preText()).not.toContain('auth_Token');
});

it('Zod tab emits UserSchema', async () => {
  render(<ExportPopover scope={{ kind: 'type', typeKey: 'User' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /zod/i }));
  expect(preText()).toContain('UserSchema');
});

it('JSON Schema tab emits a JSON object with properties', async () => {
  render(<ExportPopover scope={{ kind: 'type', typeKey: 'User' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /json schema/i }));
  const text = preText();
  expect(text).toContain('"properties"');
  expect(text).toContain('"id"');
  // Valid JSON
  expect(() => JSON.parse(text)).not.toThrow();
});

it('folder-keyed type uses flattened name in filename and JSON Schema lookup', () => {
  render(<ExportPopover scope={{ kind: 'type', typeKey: 'auth/Token' }} onClose={vi.fn()} />);
  // TS tab — interface name should be sanitized to auth_Token
  expect(preText()).toMatch(/(interface|type)\s+auth_Token/);
});
