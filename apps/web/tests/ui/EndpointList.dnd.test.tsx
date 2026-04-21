import 'fake-indexeddb/auto';
import { resolveEndpointFolderFromDragEnd, ENDPOINT_LIST_ROOT_ID } from '../../src/ui/EndpointList';
import { useSpecStore } from '../../src/state/store';
import { emptySpec, type Endpoint } from '@zwaggen/core';
import type { DragEndEvent } from '@dnd-kit/core';

const ep = (overrides: Partial<Endpoint>): Endpoint => ({
  id: 'x',
  method: 'GET', path: '/p', pathParams: [], queryParams: [], headers: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  ...overrides,
});

beforeEach(() => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [
        ep({ id: 'a', path: '/login', folder: 'auth' }),
        ep({ id: 'b', path: '/charges', folder: 'billing' }),
      ],
    },
    fileHandle: null,
    dirty: false,
  });
});

function dragEnd(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

test('moving an endpoint to another folder updates its folder field', async () => {
  const eps = useSpecStore.getState().spec.endpoints;
  const resolved = resolveEndpointFolderFromDragEnd(dragEnd('a', 'billing'), eps);
  expect(resolved).toEqual({ endpointId: 'a', folder: 'billing' });
  await useSpecStore.getState().setEndpointFolder(resolved!.endpointId, resolved!.folder);
  const moved = useSpecStore.getState().spec.endpoints.find((e) => e.id === 'a')!;
  expect(moved.folder).toBe('billing');
});

test('dropping onto the root zone clears the folder field', async () => {
  const eps = useSpecStore.getState().spec.endpoints;
  const resolved = resolveEndpointFolderFromDragEnd(dragEnd('a', ENDPOINT_LIST_ROOT_ID), eps);
  expect(resolved).toEqual({ endpointId: 'a', folder: null });
  await useSpecStore.getState().setEndpointFolder(resolved!.endpointId, resolved!.folder);
  const moved = useSpecStore.getState().spec.endpoints.find((e) => e.id === 'a')!;
  expect(moved.folder).toBeUndefined();
});

test('dropping onto the same folder is a no-op (resolver returns null)', () => {
  const eps = useSpecStore.getState().spec.endpoints;
  const resolved = resolveEndpointFolderFromDragEnd(dragEnd('a', 'auth'), eps);
  expect(resolved).toBeNull();
});

test('dropping outside any droppable is a no-op', () => {
  const eps = useSpecStore.getState().spec.endpoints;
  const resolved = resolveEndpointFolderFromDragEnd(dragEnd('a', null), eps);
  expect(resolved).toBeNull();
});

test('dropping a root-folder endpoint onto root is a no-op', () => {
  useSpecStore.setState({
    spec: {
      ...emptySpec(),
      endpoints: [ep({ id: 'r', path: '/root' })],
    },
  });
  const eps = useSpecStore.getState().spec.endpoints;
  const resolved = resolveEndpointFolderFromDragEnd(dragEnd('r', ENDPOINT_LIST_ROOT_ID), eps);
  expect(resolved).toBeNull();
});
