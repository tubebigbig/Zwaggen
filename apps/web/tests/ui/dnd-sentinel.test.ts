import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { isValidSegment, emptySpec } from '@zwaggen/core';
import { TYPE_PANEL_ROOT_ID, resolveTypeFolderFromDragEnd } from '../../src/ui/TypePanel';
import { ENDPOINT_LIST_ROOT_ID, resolveEndpointFolderFromDragEnd } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import type { DragEndEvent } from '@dnd-kit/core';

function dragEnd(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

describe('DnD root sentinels are folder-segment-safe', () => {
  test('TYPE_PANEL_ROOT_ID is rejected by isValidSegment', () => {
    expect(isValidSegment(TYPE_PANEL_ROOT_ID)).toBe(false);
  });

  test('ENDPOINT_LIST_ROOT_ID is rejected by isValidSegment', () => {
    expect(isValidSegment(ENDPOINT_LIST_ROOT_ID)).toBe(false);
  });

  test('a type literally named __root__ does not collide with the type-panel sentinel', async () => {
    // Pre-fix, both __root__ (the user's folder name) and the sentinel were
    // the same string — dropping a child onto the root would either be eaten
    // by the user folder or vice-versa. Now they cannot collide.
    useSpecStore.setState({
      spec: {
        ...emptySpec(),
        types: {
          '__root__/Child': { kind: 'object', fields: [] },
        },
      },
      fileHandle: null,
      dirty: false,
    });
    const keys = Object.keys(useSpecStore.getState().spec.types);
    const resolved = resolveTypeFolderFromDragEnd(
      dragEnd('__root__/Child', TYPE_PANEL_ROOT_ID),
      keys,
    );
    expect(resolved).toEqual({ typeKey: '__root__/Child', folder: null });
    await useSpecStore.getState().setTypeFolder(resolved!.typeKey, resolved!.folder);
    const after = Object.keys(useSpecStore.getState().spec.types);
    // Type ends up at root (no folder), not stuck in __root__.
    expect(after).toContain('Child');
    expect(after).not.toContain('__root__/Child');
  });

  test('an endpoint folder literally named __root__ does not collide with the endpoint sentinel', async () => {
    useSpecStore.setState({
      spec: {
        ...emptySpec(),
        endpoints: [
          {
            id: 'ep1', method: 'GET', path: '/', folder: '__root__',
            pathParams: [],
            requestBody: null, responses: [],
            auth: 'inherit', useProxy: 'inherit',
          },
        ],
      },
      fileHandle: null,
      dirty: false,
    });
    const eps = useSpecStore.getState().spec.endpoints;
    const resolved = resolveEndpointFolderFromDragEnd(
      dragEnd('ep1', ENDPOINT_LIST_ROOT_ID),
      eps,
    );
    expect(resolved).toEqual({ endpointId: 'ep1', folder: null });
    await useSpecStore.getState().setEndpointFolder(resolved!.endpointId, resolved!.folder);
    const after = useSpecStore.getState().spec.endpoints[0]!;
    expect(after.folder).toBeUndefined();
  });
});
