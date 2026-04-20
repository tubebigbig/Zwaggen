import { get, set } from 'idb-keyval';
import type { RunInputs, RunResult } from '@zwaggen/core';

const HISTORY_KEY = 'zwaggen:history';
const MAX_PER_ENDPOINT = 20;
const MAX_BODY_BYTES = 100 * 1024;

export interface HistoryEntry {
  id: string;
  at: number;
  endpointId: string;
  inputs: RunInputs;
  baseUrlUsed: string;
  useProxyUsed: boolean;
  result: TrimmedResult;
}

export interface TrimmedResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  latencyMs?: number;
  rawText?: string;
  rawTruncated?: boolean;
  validationErrors?: Array<{ path: string; message: string }>;
  errorKind?: string;
  errorHint?: string;
}

type Store = Record<string, HistoryEntry[]>;

export async function loadHistory(endpointId: string): Promise<HistoryEntry[]> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  return store[endpointId] ?? [];
}

export async function pushHistory(entry: HistoryEntry): Promise<void> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  const bucket = [entry, ...(store[entry.endpointId] ?? [])].slice(0, MAX_PER_ENDPOINT);
  store[entry.endpointId] = bucket;
  await set(HISTORY_KEY, store);
}

export async function clearEndpointHistory(endpointId: string): Promise<void> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  delete store[endpointId];
  await set(HISTORY_KEY, store);
}

export async function reconcileHistory(validEndpointIds: Set<string>): Promise<void> {
  const store = (await get<Store>(HISTORY_KEY)) ?? {};
  let mutated = false;
  for (const id of Object.keys(store)) {
    if (!validEndpointIds.has(id)) { delete store[id]; mutated = true; }
  }
  if (mutated) await set(HISTORY_KEY, store);
}

export function trimResult(
  r: RunResult,
  validationErrors: Array<{ path: string; message: string }>,
): TrimmedResult {
  const rawTruncated = !!(r.rawText && r.rawText.length > MAX_BODY_BYTES);
  return {
    ok: r.ok,
    status: r.status,
    statusText: r.statusText,
    headers: r.headers,
    latencyMs: r.latencyMs,
    rawText: rawTruncated ? r.rawText!.slice(0, MAX_BODY_BYTES) : r.rawText,
    rawTruncated,
    validationErrors,
    errorKind: r.error?.kind,
    errorHint: r.error?.hint,
  };
}
