import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ExportPopover } from '../../src/ui/ExportPopover';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type RefType, type Spec } from '@zwaggen/core';

function fixture(): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.types['User'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  s.types['Company'] = {
    kind: 'object',
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  s.endpoints = [
    {
      id: 'getUser',
      method: 'GET',
      path: '/users/{id}',
      pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } as RefType }],
      auth: 'inherit',
      useProxy: 'inherit',
    },
    {
      id: 'getCompany',
      method: 'GET',
      path: '/companies',
      pathParams: [],
      requestBody: null,
      responses: [{ status: 200, type: { kind: 'ref', ref: 'Company' } as RefType }],
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

it('endpoint scope renders cURL + types/schemas/client/openapi.json tabs', () => {
  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /^cURL$/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^types\.ts$/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^schemas\.ts$/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^client\.ts$/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^openapi\.json$/i })).toBeInTheDocument();
});

// The visible output renders inside a <pre>; a hidden <textarea> mirrors the
// same text for clipboard-fallback. Both match `getByText`, so scope queries
// to the <pre> element by tag.
function preText(): string {
  const pre = document.querySelector('pre');
  if (!pre) throw new Error('No <pre> output element rendered');
  return pre.textContent ?? '';
}

it('cURL tab shows the URL with placeholder inputs', () => {
  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);
  // cURL is the default tab. The path may render with `{{id}}` URL-encoded
  // (encodeURIComponent('{{id}}') === '%7B%7Bid%7D%7D') so accept either form.
  const text = preText();
  expect(text).toMatch(/curl -X GET/);
  expect(text).toMatch(/\/users\/(\{\{id\}\}|%7B%7Bid%7D%7D)/);
});

it('types.ts tab shows the closure of types referenced by this endpoint', async () => {
  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /^types\.ts$/i }));
  const text = preText();
  expect(text).toMatch(/(interface|type)\s+User/);
  // Unrelated type must not be pulled in
  expect(text).not.toMatch(/\bCompany\b/);
});

it('schemas.ts tab shows Zod schemas for closure types only', async () => {
  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /^schemas\.ts$/i }));
  const text = preText();
  expect(text).toContain('UserSchema');
  expect(text).not.toContain('CompanySchema');
});

it('client.ts tab shows the endpoint method', async () => {
  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /^client\.ts$/i }));
  const text = preText();
  expect(text).toMatch(/getUser/);
});

it('openapi.json tab is valid JSON containing only this endpoint path', async () => {
  render(<ExportPopover scope={{ kind: 'endpoint', endpointId: 'getUser' }} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: /^openapi\.json$/i }));
  const text = preText();
  expect(text).toContain('"/users/{id}"');
  // Must round-trip as valid JSON.
  const parsed = JSON.parse(text);
  expect(parsed).toBeTruthy();
  // The unrelated endpoint must not be in this slice.
  expect(text).not.toContain('"/companies"');
});
