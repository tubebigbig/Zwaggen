import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useToasts } from '../../src/state/toasts';

beforeEach(() => {
  useToasts.setState({ toasts: [] });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('pushToast adds an entry', () => {
  const id = useToasts.getState().pushToast('Hello', 'info');
  const ts = useToasts.getState().toasts;
  expect(ts).toHaveLength(1);
  expect(ts[0]?.id).toBe(id);
  expect(ts[0]?.kind).toBe('info');
  expect(ts[0]?.message).toBe('Hello');
});

it('dismissToast removes the entry', () => {
  const id = useToasts.getState().pushToast('Bye', 'error');
  useToasts.getState().dismissToast(id);
  expect(useToasts.getState().toasts).toHaveLength(0);
});

it('auto-dismisses after the duration', () => {
  useToasts.getState().pushToast('Brief', 'info', 1000);
  expect(useToasts.getState().toasts).toHaveLength(1);
  vi.advanceTimersByTime(999);
  expect(useToasts.getState().toasts).toHaveLength(1);
  vi.advanceTimersByTime(2);
  expect(useToasts.getState().toasts).toHaveLength(0);
});
