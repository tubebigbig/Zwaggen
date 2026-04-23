import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointEditor } from '../../src/ui/EndpointEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Endpoint } from '@zwaggen/core';

function seedSpec(endpoint: Endpoint): void {
  useSpecStore.setState({
    spec: { ...emptySpec(), endpoints: [endpoint] },
    fileHandle: null,
    dirty: false,
    selectedEndpointId: endpoint.id,
  });
}

function multipartEndpointWithOneField(): Endpoint {
  return {
    id: 'e1', method: 'POST', path: '/upload',
    pathParams: [],
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [{ name: 'attachment', required: true, type: { kind: 'string' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
}

function urlencodedEndpointWithOneField(): Endpoint {
  return {
    id: 'e1', method: 'POST', path: '/login',
    pathParams: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [{ name: 'username', required: true, type: { kind: 'string' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
}

test('multipart bodyForm row offers File in the type-kind dropdown', () => {
  seedSpec(multipartEndpointWithOneField());
  render(<EndpointEditor />);

  // Body-form rows render TypeBuilder, which exposes a "Kind" select.
  const kindSelect = screen.getByLabelText('Kind') as HTMLSelectElement;
  const options = Array.from(kindSelect.options).map((o) => o.value);
  expect(options).toContain('file');
});

test('urlencoded bodyForm row does NOT offer File in the type-kind dropdown', () => {
  seedSpec(urlencodedEndpointWithOneField());
  render(<EndpointEditor />);

  const kindSelect = screen.getByLabelText('Kind') as HTMLSelectElement;
  const options = Array.from(kindSelect.options).map((o) => o.value);
  expect(options).not.toContain('file');
});

test('selecting the File kind in a multipart row writes a FileType into bodyForm', async () => {
  seedSpec(multipartEndpointWithOneField());
  render(<EndpointEditor />);

  const kindSelect = screen.getByLabelText('Kind') as HTMLSelectElement;
  await userEvent.selectOptions(kindSelect, 'file');

  const ep = useSpecStore.getState().spec.endpoints[0]!;
  expect(ep.bodyForm![0]!.type).toEqual({ kind: 'file' });
});

test('File row renders accept + maxBytes inputs', async () => {
  seedSpec({
    ...multipartEndpointWithOneField(),
    bodyForm: [{ name: 'attachment', required: true, type: { kind: 'file' } }],
  });
  render(<EndpointEditor />);

  expect(screen.getByLabelText('accept')).toBeInTheDocument();
  expect(screen.getByLabelText('maxBytes')).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText('accept'), 'image/*');
  const ep = useSpecStore.getState().spec.endpoints[0]!;
  expect((ep.bodyForm![0]!.type as { accept?: string }).accept).toBe('image/*');
});

test('path/query/header ParamTables never offer File even on a multipart endpoint', () => {
  seedSpec({
    ...multipartEndpointWithOneField(),
    pathParams: [{ name: 'p', required: true, type: { kind: 'string' } }],
    queryParams: { kind: 'object', fields: [{ name: 'q', required: true, type: { kind: 'string' } }] },
    headers: { kind: 'object', fields: [{ name: 'h', required: true, type: { kind: 'string' } }] },
  });
  render(<EndpointEditor />);

  // The body section's heading reads "Form fields" — there's also a
  // top-level `formFields` label that surfaces in EndpointEditor's section
  // chrome. Pick the heading-element specifically by role+name to dodge the
  // duplicate.
  const formFieldsHeading = screen.getByRole('heading', { name: 'Form fields' });
  const formFieldsCard = formFieldsHeading.closest('section');
  expect(formFieldsCard).not.toBeNull();

  const allKindSelects = screen.getAllByLabelText('Kind') as HTMLSelectElement[];
  for (const select of allKindSelects) {
    const inFormFieldsCard = formFieldsCard!.contains(select);
    if (inFormFieldsCard) continue;
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).not.toContain('file');
  }
});

test('TypeBuilder inside a multipart object field does NOT surface File (nested types are illegal)', async () => {
  seedSpec({
    ...multipartEndpointWithOneField(),
    bodyForm: [
      {
        name: 'meta',
        required: true,
        type: { kind: 'object', fields: [{ name: 'inner', required: true, type: { kind: 'string' } }] },
      },
    ],
  });
  render(<EndpointEditor />);

  // Expand the inner FieldRow so its nested TypeBuilder mounts. The row
  // header is the parent of the field-name input; clicking it toggles the
  // body open.
  const innerNameInput = screen.getByLabelText('field name 0');
  const innerHeader = innerNameInput.parentElement;
  await userEvent.click(innerHeader!);

  const allKindSelects = screen.getAllByLabelText('Kind') as HTMLSelectElement[];
  // Two kind selects appear: one at depth 0 (the bodyForm row, currently
  // 'object') and one at depth 1 (the inner field's 'string' type). Only
  // the depth-0 select should include 'file'.
  const fileOptionCount = allKindSelects.filter((s) =>
    Array.from(s.options).map((o) => o.value).includes('file'),
  ).length;
  expect(fileOptionCount).toBe(1);
  const outer = allKindSelects.find((s) => Array.from(s.options).map((o) => o.value).includes('file'));
  expect(outer?.value).toBe('object');
});

// Smoke test that the Switch warning hint copy is wired up — used by future
// EndpointEditor warning UI. For now we just assert the i18n key is present.
test('en + zh-TW locales include the file-type-multipart-only warning string', async () => {
  const en = (await import('../../src/i18n/locales/en.json')).default as Record<string, string>;
  const zh = (await import('../../src/i18n/locales/zh-TW.json')).default as Record<string, string>;
  expect(en.fileTypeMultipartOnly).toBeDefined();
  expect(zh.fileTypeMultipartOnly).toBeDefined();
});

// Make `within` referenced so the import isn't flagged as unused for future tests.
void within;
