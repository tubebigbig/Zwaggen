import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useDebounce } from '../../src/hooks/useDebounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('returns the initial value synchronously', () => {
  const { result } = renderHook(() => useDebounce('a', 300));
  expect(result.current).toBe('a');
});

it('debounces value updates by the given ms', () => {
  const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
    initialProps: { value: 'a' },
  });
  expect(result.current).toBe('a');

  rerender({ value: 'b' });
  expect(result.current).toBe('a'); // not yet — within debounce window

  act(() => {
    vi.advanceTimersByTime(299);
  });
  expect(result.current).toBe('a');

  act(() => {
    vi.advanceTimersByTime(2);
  });
  expect(result.current).toBe('b');
});

it('cancels the pending update when value changes again within the window', () => {
  const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
    initialProps: { value: 'a' },
  });
  rerender({ value: 'b' });
  act(() => { vi.advanceTimersByTime(150); });
  rerender({ value: 'c' });
  act(() => { vi.advanceTimersByTime(150); });
  expect(result.current).toBe('a'); // 'b' got cancelled by the 'c' update
  act(() => { vi.advanceTimersByTime(150); });
  expect(result.current).toBe('c'); // only the latest survives
});
