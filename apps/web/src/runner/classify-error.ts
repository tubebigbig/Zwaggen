export type ClassifiedError =
  | { kind: 'timeout'; hint: string }
  | { kind: 'cors-or-network'; hint: string }
  | { kind: 'other'; hint: string; message: string };

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: 'timeout', hint: 'Request took too long. Check the server or raise the timeout.' };
  }
  if (err instanceof TypeError) {
    return {
      kind: 'cors-or-network',
      hint: 'Failed to fetch — likely CORS, DNS, or the server is down. Enable CORS on the server or toggle "Use proxy" on this request.',
    };
  }
  return { kind: 'other', hint: 'Unexpected error', message: err instanceof Error ? err.message : String(err) };
}
