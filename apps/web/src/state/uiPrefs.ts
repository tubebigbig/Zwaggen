import { useSyncExternalStore } from 'react';

export type UiPrefs = {
  typesCollapsed: boolean;
  endpointsCollapsed: boolean;
  sidebarCollapsed: boolean;
  endpointGroupCollapsed: Record<string, boolean>;
  typeFolderCollapsed: Record<string, boolean>;
  endpointFolderCollapsed: Record<string, boolean>;
  livePreviewOpen: boolean;
};

const KEY = 'zwaggen.ui.prefs.v1';
const DEFAULTS: UiPrefs = {
  typesCollapsed: true,
  endpointsCollapsed: false,
  sidebarCollapsed: false,
  endpointGroupCollapsed: {},
  typeFolderCollapsed: {},
  endpointFolderCollapsed: {},
  livePreviewOpen: false,
};

let state: UiPrefs = load();
const listeners = new Set<() => void>();

function load(): UiPrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UiPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return state;
}

export function setUiPref<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) {
  state = { ...state, [key]: value };
  persist();
  listeners.forEach((l) => l());
}

export function toggleUiPref(key: keyof UiPrefs) {
  setUiPref(key, !state[key]);
}

export function toggleEndpointGroup(key: string) {
  const cur = state.endpointGroupCollapsed ?? {};
  setUiPref('endpointGroupCollapsed', { ...cur, [key]: !cur[key] });
}

export function toggleTypeFolder(path: string) {
  const cur = state.typeFolderCollapsed ?? {};
  setUiPref('typeFolderCollapsed', { ...cur, [path]: !cur[path] });
}

export function toggleEndpointFolder(path: string) {
  const cur = state.endpointFolderCollapsed ?? {};
  setUiPref('endpointFolderCollapsed', { ...cur, [path]: !cur[path] });
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);
}
