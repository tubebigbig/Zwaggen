/**
 * Strict CSP applied in preview/start mode (NOT dev mode — Vite HMR needs ws://).
 * `connect-src 'none'` enforces the architectural invariant that the renderer
 * never makes outbound HTTP directly: every request goes through the IPC bridge
 * and Node's `fetch` in the main process.
 */
export const STRICT_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'none';";
