const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function validateVersion(version, latestTag) {
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`version is required (semver, e.g. 0.2.0)`);
  }
  if (version.startsWith('v')) {
    throw new Error(`version must have no leading v (got "${version}"; use "${version.slice(1)}")`);
  }
  if (!SEMVER_RE.test(version)) {
    throw new Error(`version must be plain semver MAJOR.MINOR.PATCH (got "${version}"; pre-release/build tags not supported in v1)`);
  }
  if (latestTag) {
    const prev = latestTag.replace(/^v/, '');
    if (!SEMVER_RE.test(prev)) {
      throw new Error(`latest tag "${latestTag}" is not parseable as semver — refusing to compare`);
    }
    if (compareSemver(version, prev) <= 0) {
      throw new Error(`version "${version}" must be strictly greater than latest tag "${latestTag}"`);
    }
  }
}

// CLI entrypoint: node validate-version.mjs <version> [<latest-tag-or-empty>]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , version, latestTag] = process.argv;
  try {
    validateVersion(version, latestTag || null);
    console.log(`ok: ${version}`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
