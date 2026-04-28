import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickSave, pickOpen } from '../../src/storage/file';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pickSave', () => {
  it('returns null when picker is cancelled (AbortError)', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(
      new DOMException('User cancelled', 'AbortError'),
    ));
    expect(await pickSave()).toBeNull();
  });

  it('propagates non-AbortError errors', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(pickSave()).rejects.toThrow('boom');
  });
});

describe('pickOpen', () => {
  it('returns null when picker is cancelled (AbortError)', async () => {
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockRejectedValue(
      new DOMException('User cancelled', 'AbortError'),
    ));
    expect(await pickOpen()).toBeNull();
  });
});
