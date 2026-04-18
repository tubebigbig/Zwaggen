import 'fake-indexeddb/auto';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunPanel } from '../../src/ui/RunPanel';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { saveSecrets } from '../../src/storage/drafts';
import type { Spec } from '../../src/schema/types';

// Helper: build a spec with one GET endpoint and a base URL
function makeSpec(): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.endpoints = [
    {
      id: 'e1',
      method: 'GET',
      path: '/items',
      pathParams: [],
      queryParams: [],
      headers: [],
      requestBody: null,
      responses: [],
      auth: 'inherit',
      useProxy: 'inherit',
    },
  ];
  return s;
}

async function seedStore(spec: Spec) {
  await useSpecStore.getState().replaceSpec(spec, null);
  useSpecStore.getState().selectEndpoint(spec.endpoints[0]!.id);
}

// Clipboard stub helpers using Object.defineProperty (configurable)
function stubClipboard(impl: { writeText: (...args: unknown[]) => Promise<void> }) {
  Object.defineProperty(navigator, 'clipboard', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // Always restore real timers so fake timers from one test don't bleed
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Reset clipboard to undefined between tests
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

// --- Test 1: Happy path — secret is masked ---
// The secret env var TOKEN is used in the base URL. buildRequest() substitutes
// {{TOKEN}} with the raw value 'abc123', then secretMaskFor replaces 'abc123'
// with '$TOKEN' in the final cURL command.
it('masks secret env values in the copied cURL command', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  stubClipboard({ writeText });
  // Stub confirm to 'true' — collectMissingVars sees {{TOKEN}} as missing
  // (secrets aren't in the known-plain-vars map used for the missing-var check)
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

  const spec = makeSpec();
  spec.environments['default'] = {
    variables: [{ name: 'TOKEN', value: '', secret: true }],
  };
  spec.info.baseUrl = 'https://{{TOKEN}}.example.com';
  await seedStore(spec);
  // Store the secret in idb so loadSecrets() returns it during copy
  await saveSecrets({ default: { TOKEN: 'abc123' } });

  render(<RunPanel />);

  await userEvent.click(screen.getByTitle('Copy as cURL'));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  const cmd: string = writeText.mock.calls[0]![0] as string;
  expect(cmd).toContain('$TOKEN');
  expect(cmd).not.toContain('abc123');
});

// --- Test 1b: copied flag flips then resets ---
// Verifies the setTimeout is scheduled with 1500ms and that the button shows
// "Copied" immediately after a successful copy. We spy on setTimeout to capture
// the callback rather than advancing fake timers (which conflicts with fake-indexeddb).
it('button text flips to "Copied" and resets after timeout', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  stubClipboard({ writeText });

  const spec = makeSpec();
  await seedStore(spec);

  // Spy on setTimeout to capture the reset callback without faking all timers
  const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

  render(<RunPanel />);

  await userEvent.click(screen.getByTitle('Copy as cURL'));

  // Button should show "Copied" after click resolves
  await waitFor(() => {
    expect(screen.getByTitle('Copy as cURL')).toHaveTextContent('Copied');
  });

  // Verify setTimeout was called with a 1500ms delay for the reset
  const timerCalls = setTimeoutSpy.mock.calls;
  const resetCall = timerCalls.find((c) => c[1] === 1500);
  expect(resetCall).toBeDefined();

  // Manually invoke the reset callback to verify the label returns
  const resetFn = resetCall![0] as () => void;
  act(() => {
    resetFn();
  });

  expect(screen.getByTitle('Copy as cURL')).toHaveTextContent('Copy as cURL');
});

// --- Test 2: Plain-text (non-secret) var appears literally ---
it('includes the literal value of non-secret env vars in the curl command', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  stubClipboard({ writeText });

  const spec = makeSpec();
  spec.environments['default'] = {
    variables: [{ name: 'ENV', value: 'prod', secret: false }],
  };
  spec.info.baseUrl = 'https://{{ENV}}.example.com';
  await seedStore(spec);

  render(<RunPanel />);

  await userEvent.click(screen.getByTitle('Copy as cURL'));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  const cmd: string = writeText.mock.calls[0]![0] as string;
  expect(cmd).toContain('prod');
  expect(cmd).not.toContain('$ENV');
});

// --- Test 3: Fallback textarea on clipboard rejection ---
it('renders fallback textarea when clipboard.writeText rejects', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('denied'));
  stubClipboard({ writeText });

  const spec = makeSpec();
  await seedStore(spec);

  render(<RunPanel />);

  await userEvent.click(screen.getByTitle('Copy as cURL'));

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // The fallback area should contain a textarea with the cURL command
  const textarea = screen.getByRole('alert').querySelector('textarea');
  expect(textarea).not.toBeNull();
  expect(textarea!.value).toContain('curl');
});

// --- Test 4: Missing-var confirm dialog — cancel skips clipboard ---
it('does not copy when user cancels the missing-var confirm dialog', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  stubClipboard({ writeText });

  const spec = makeSpec();
  // Reference an undefined var in the base URL
  spec.info.baseUrl = 'https://{{foo}}.example.com';
  await seedStore(spec);

  // Stub window.confirm to return false (user clicks "Cancel")
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

  render(<RunPanel />);

  await userEvent.click(screen.getByTitle('Copy as cURL'));

  expect(writeText).not.toHaveBeenCalled();
});

// --- Test 5: No-body endpoint — no --data-raw in command ---
it('omits --data-raw for a GET endpoint with no requestBody', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  stubClipboard({ writeText });

  const spec = makeSpec();
  // requestBody is already null in makeSpec
  await seedStore(spec);

  render(<RunPanel />);

  await userEvent.click(screen.getByTitle('Copy as cURL'));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  const cmd: string = writeText.mock.calls[0]![0] as string;
  expect(cmd).not.toContain('--data-raw');
});
