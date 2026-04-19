import { describe, it, expect } from 'vitest';
import { validateVersion, compareSemver } from './validate-version.mjs';

describe('compareSemver', () => {
  it('returns 0 for equal', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });
  it('returns positive when a > b', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareSemver('1.3.0', '1.2.99')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });
  it('returns negative when a < b', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0);
  });
});

describe('validateVersion', () => {
  it('accepts a clean semver greater than the latest tag', () => {
    expect(() => validateVersion('0.2.0', 'v0.1.0')).not.toThrow();
  });
  it('accepts any version when no prior tag', () => {
    expect(() => validateVersion('0.1.0', null)).not.toThrow();
  });
  it('rejects non-semver formats', () => {
    expect(() => validateVersion('0.2', null)).toThrow(/semver/i);
    expect(() => validateVersion('v0.2.0', null)).toThrow(/no leading v/i);
    expect(() => validateVersion('0.2.0-beta', null)).toThrow(/semver/i);
    expect(() => validateVersion('', null)).toThrow(/semver/i);
  });
  it('rejects equal-or-lower versions vs latest tag', () => {
    expect(() => validateVersion('0.1.0', 'v0.1.0')).toThrow(/greater than/i);
    expect(() => validateVersion('0.0.9', 'v0.1.0')).toThrow(/greater than/i);
  });
});
