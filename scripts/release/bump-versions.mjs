import { readFileSync, writeFileSync } from 'node:fs';

export function bumpVersions(version, packageJsonPaths) {
  for (const p of packageJsonPaths) {
    const raw = readFileSync(p, 'utf8');
    const pkg = JSON.parse(raw);
    pkg.version = version;
    // Preserve trailing newline if the original had one.
    const trailingNewline = raw.endsWith('\n') ? '\n' : '';
    writeFileSync(p, JSON.stringify(pkg, null, 2) + trailingNewline);
  }
}

// CLI: node bump-versions.mjs <version> <pkg1.json> <pkg2.json> ...
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , version, ...paths] = process.argv;
  if (!version || paths.length === 0) {
    console.error('usage: node bump-versions.mjs <version> <pkg.json> [<pkg.json> ...]');
    process.exit(2);
  }
  bumpVersions(version, paths);
  console.log(`bumped ${paths.length} package.json file(s) to ${version}`);
}
