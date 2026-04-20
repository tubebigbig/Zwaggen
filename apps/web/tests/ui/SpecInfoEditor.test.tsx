import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { SpecInfoEditor } from '../../src/ui/SpecInfoEditor';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

describe('SpecInfoEditor — baseUrl', () => {
  beforeEach(async () => {
    await useSpecStore.getState().replaceSpec(emptySpec(), null);
  });

  it('stores a typed URL as info.baseUrl', async () => {
    render(<SpecInfoEditor />);
    const input = screen.getByLabelText('Base URL');
    await userEvent.type(input, 'https://api.example.com');
    expect(useSpecStore.getState().spec.info.baseUrl).toBe('https://api.example.com');
  });

  it('clears the key back to undefined on empty input', async () => {
    const s = emptySpec();
    s.info.baseUrl = 'https://api.example.com';
    await useSpecStore.getState().replaceSpec(s, null);

    render(<SpecInfoEditor />);
    const input = screen.getByLabelText('Base URL');
    await userEvent.clear(input);

    expect(useSpecStore.getState().spec.info.baseUrl).toBeUndefined();
  });
});
