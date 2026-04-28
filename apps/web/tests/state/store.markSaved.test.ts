import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { getStorage } from '../../src/storage/spec-storage';

describe('markSaved', () => {
  beforeEach(async () => {
    // Reset to a known state so previous tests' state can't leak in.
    await useSpecStore.getState().replaceSpec(emptySpec(), null);
  });

  it('clearDraft runs before dirty flips to false', async () => {
    // Make the spec dirty so there's a real draft to clear.
    await useSpecStore.getState().setSpec(emptySpec('Touched'));
    expect(useSpecStore.getState().dirty).toBe(true);

    const order: string[] = [];
    const realClearDraft = getStorage().clearDraft.bind(getStorage());
    const clearSpy = vi.spyOn(getStorage(), 'clearDraft').mockImplementation(async () => {
      order.push('clearDraft-start');
      await realClearDraft();
      order.push('clearDraft-end');
    });

    // Subscribe to dirty changes — record the moment dirty flips to false.
    const unsubscribe = useSpecStore.subscribe((state, prev) => {
      if (state.dirty === false && prev.dirty === true) {
        order.push('dirty-flipped-false');
      }
    });

    await useSpecStore.getState().markSaved(null);
    unsubscribe();

    expect(useSpecStore.getState().dirty).toBe(false);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    // Order: clearDraft must complete before dirty flips
    expect(order).toEqual(['clearDraft-start', 'clearDraft-end', 'dirty-flipped-false']);
  });
});
