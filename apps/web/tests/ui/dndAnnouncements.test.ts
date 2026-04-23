import { afterEach, describe, expect, test } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import i18n from '../../src/i18n';
import { useDndAnnouncements } from '../../src/ui/dndAnnouncements';

async function setLang(lng: string) {
  await act(async () => {
    await i18n.changeLanguage(lng);
  });
}

afterEach(async () => {
  await setLang('en');
});

function activeOver(activeId: string, overId: string | null) {
  return {
    active: { id: activeId } as any,
    over: overId === null ? null : ({ id: overId } as any),
  };
}

describe('useDndAnnouncements', () => {
  test('returns English defaults when locale is en', async () => {
    await setLang('en');
    const { result } = renderHook(() => useDndAnnouncements());
    expect(result.current.onDragStart(activeOver('A', null))).toBe('Picked up A.');
    expect(result.current.onDragOver!(activeOver('A', 'b'))).toBe('A is over b.');
    expect(result.current.onDragOver!(activeOver('A', null))).toBe(
      'A is no longer over a droppable area.',
    );
    expect(result.current.onDragEnd(activeOver('A', 'b'))).toBe('A was dropped over b.');
    expect(result.current.onDragEnd(activeOver('A', null))).toBe('A was dropped.');
    expect(result.current.onDragCancel(activeOver('A', null))).toBe(
      'Dragging was cancelled. A returned to its original position.',
    );
  });

  test('returns localized strings when locale is zh-TW', async () => {
    await setLang('zh-TW');
    const { result } = renderHook(() => useDndAnnouncements());
    expect(result.current.onDragStart(activeOver('A', null))).toBe('已選取 A。');
    expect(result.current.onDragOver!(activeOver('A', 'b'))).toBe('A 在 b 上方。');
    expect(result.current.onDragOver!(activeOver('A', null))).toBe(
      'A 不在任何可放置區域上方。',
    );
    expect(result.current.onDragEnd(activeOver('A', 'b'))).toBe('已將 A 放到 b。');
    expect(result.current.onDragEnd(activeOver('A', null))).toBe('A 已放下。');
    expect(result.current.onDragCancel(activeOver('A', null))).toBe(
      '已取消拖曳。A 回到原位。',
    );
  });

  test('coerces numeric ids to strings via interpolation', async () => {
    await setLang('en');
    const { result } = renderHook(() => useDndAnnouncements());
    expect(result.current.onDragStart(activeOver(42 as unknown as string, null))).toBe(
      'Picked up 42.',
    );
  });
});
