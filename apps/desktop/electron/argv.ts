import { existsSync, statSync } from 'node:fs';

const SPEC_EXTENSIONS = /\.(zwag|zwag\.json|json)$/i;

export function extractSpecPath(argv: string[]): string | null {
  // argv[0] is the electron binary; argv[1..] may include the main script
  // path (unpacked) or be the user-supplied args (packaged). Skip argv[0]
  // and probe everything else for spec-shaped paths.
  const candidates = argv.slice(1).filter((a) => SPEC_EXTENSIONS.test(a));
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch { /* ignore */ }
  }
  return null;
}
