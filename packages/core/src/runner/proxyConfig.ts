let activeProxyUrl: string = 'http://localhost:4801';

/** Returns the active default proxy URL. */
export function getProxyUrl(): string {
  return activeProxyUrl;
}

/**
 * Replace the active default proxy URL. Mirrors `setStorage` / `setTransport`
 * — `apps/web` calls this once at boot when running under the bundled
 * `npx @zwaggen/web` server (proxyUrl = '/proxy', same-origin).
 */
export function setProxyUrl(url: string): void {
  activeProxyUrl = url;
}

/** Restore the standalone-proxy default. Useful in tests. */
export function resetProxyUrl(): void {
  activeProxyUrl = 'http://localhost:4801';
}
