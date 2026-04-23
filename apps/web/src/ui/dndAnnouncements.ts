import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Announcements } from '@dnd-kit/core';

/**
 * Returns a localized `Announcements` object for `@dnd-kit`'s `DndContext`
 * `accessibility.announcements` prop. Defaults emit English; this hook
 * forwards each lifecycle callback through `react-i18next` so zh-TW (and any
 * future locale) get translated screen-reader narration of DnD events
 * instead of @dnd-kit's English-only baseline.
 *
 * The shape mirrors `@dnd-kit/core`'s `Announcements` interface — every
 * callback returns a plain string. We stringify ids defensively because
 * @dnd-kit accepts both `string` and `number` as draggable / droppable ids.
 */
export function useDndAnnouncements(): Announcements {
  const { t } = useTranslation();
  return useMemo<Announcements>(() => ({
    onDragStart({ active }) {
      return t('dndAnnounceGrab', { id: String(active.id) });
    },
    onDragOver({ active, over }) {
      return over
        ? t('dndAnnounceMoveOver', { id: String(active.id), over: String(over.id) })
        : t('dndAnnounceMoveOverNothing', { id: String(active.id) });
    },
    onDragEnd({ active, over }) {
      return over
        ? t('dndAnnounceDrop', { id: String(active.id), over: String(over.id) })
        : t('dndAnnounceDropCancel', { id: String(active.id) });
    },
    onDragCancel({ active }) {
      return t('dndAnnounceMoveCancel', { id: String(active.id) });
    },
  }), [t]);
}
