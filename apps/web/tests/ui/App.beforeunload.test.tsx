import 'fake-indexeddb/auto';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from '../../src/App';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

beforeEach(async () => {
  await useSpecStore.getState().replaceSpec(emptySpec(), null);
});

it('beforeunload calls preventDefault when spec is dirty', async () => {
  render(<App />);
  // Dirty the spec — replaceSpec sets dirty=false; setSpec flips it to true.
  await useSpecStore.getState().setSpec(emptySpec('Edited'));

  const event = new Event('beforeunload', { cancelable: true });
  const preventSpy = vi.spyOn(event, 'preventDefault');
  window.dispatchEvent(event);

  expect(preventSpy).toHaveBeenCalled();
});

it('beforeunload is a no-op when spec is clean', async () => {
  render(<App />);
  // Spec is clean (replaceSpec already set dirty=false in beforeEach).
  expect(useSpecStore.getState().dirty).toBe(false);

  const event = new Event('beforeunload', { cancelable: true });
  const preventSpy = vi.spyOn(event, 'preventDefault');
  window.dispatchEvent(event);

  expect(preventSpy).not.toHaveBeenCalled();
});
