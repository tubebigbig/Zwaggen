export type BootIntent =
  | { kind: 'load-url'; url: string }
  | { kind: 'load-path'; path: string }
  | { kind: 'none' };

export function resolveBootIntent(search: string = window.location.search): BootIntent {
  const params = new URLSearchParams(search);
  const url = params.get('spec');
  if (url && /^https?:\/\//i.test(url)) return { kind: 'load-url', url };
  const path = params.get('specPath');
  if (path) return { kind: 'load-path', path };
  return { kind: 'none' };
}
