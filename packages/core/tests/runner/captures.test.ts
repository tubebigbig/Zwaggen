import { describe, it, expect } from 'vitest';
import { applyCaptures } from '../../src/runner/captures';
import type { Spec, Capture } from '../../src/schema/types';
import { CURRENT_SCHEMA_VERSION } from '../../src/schema/types';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeSpec(opts: {
  env?: string;
  extraEnvs?: Record<string, { name: string; value: string; secret: boolean }[]>;
} = {}): Spec {
  const activeEnv = opts.env ?? 'default';
  const environments: Spec['environments'] = {
    [activeEnv]: {
      variables: [
        { name: 'token', value: '', secret: false },
        { name: 'apiSecret', value: '', secret: true },
      ],
    },
  };

  if (opts.extraEnvs) {
    for (const [envName, vars] of Object.entries(opts.extraEnvs)) {
      environments[envName] = { variables: vars };
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    info: { name: 'Test Spec' },
    types: {},
    environments,
    activeEnvironment: activeEnv,
    auth: { type: 'none' },
    useProxyDefault: false,
    endpoints: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyCaptures', () => {
  it('returns empty result when captures is undefined', () => {
    const spec = makeSpec();
    expect(applyCaptures(spec, undefined, {})).toEqual({
      results: [],
      specPatch: null,
      secretsPatch: null,
    });
  });

  it('returns empty result when captures is an empty array', () => {
    const spec = makeSpec();
    expect(applyCaptures(spec, [], {})).toEqual({
      results: [],
      specPatch: null,
      secretsPatch: null,
    });
  });

  it('non-secret var, path found — updates specPatch, secretsPatch null', () => {
    const spec = makeSpec();
    const capture: Capture = { path: 'data.token', setVar: 'token' };
    const body = { data: { token: 'abc123' } };

    const out = applyCaptures(spec, [capture], body);

    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ found: true, value: 'abc123' });
    expect(out.secretsPatch).toBeNull();
    expect(out.specPatch).not.toBeNull();
    expect(out.specPatch!.environments['default']!.variables[0]!.value).toBe('abc123');
  });

  it('secret var (active env), path found — specPatch null, secretsPatch has entry', () => {
    const spec = makeSpec();
    const capture: Capture = { path: 'data.secret', setVar: 'apiSecret' };
    const body = { data: { secret: 'supersecret' } };

    const out = applyCaptures(spec, [capture], body);

    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ found: true, value: 'supersecret' });
    expect(out.specPatch).toBeNull();
    expect(out.secretsPatch).toEqual({ apiSecret: 'supersecret' });
  });

  it('capture targets missing env var → found:false with warning /not defined/', () => {
    const spec = makeSpec();
    const capture: Capture = { path: 'data.x', setVar: 'nonExistentVar' };
    const body = { data: { x: 'value' } };

    const out = applyCaptures(spec, [capture], body);

    expect(out.results).toHaveLength(1);
    expect(out.results[0]!.found).toBe(false);
    expect(out.results[0]!.warning).toMatch(/not defined/);
    expect(out.specPatch).toBeNull();
    expect(out.secretsPatch).toBeNull();
  });

  it('capture targets missing env → found:false with warning /env.*not found/', () => {
    const spec = makeSpec();
    const capture: Capture = { path: 'data.x', setVar: 'token', envName: 'missing_env' };
    const body = { data: { x: 'value' } };

    const out = applyCaptures(spec, [capture], body);

    expect(out.results).toHaveLength(1);
    expect(out.results[0]!.found).toBe(false);
    expect(out.results[0]!.warning).toMatch(/env.*not found/);
    expect(out.specPatch).toBeNull();
    expect(out.secretsPatch).toBeNull();
  });

  it('path not found in body → found:false with warning /path.*not found/', () => {
    const spec = makeSpec();
    const capture: Capture = { path: 'data.missing', setVar: 'token' };
    const body = { data: {} };

    const out = applyCaptures(spec, [capture], body);

    expect(out.results).toHaveLength(1);
    expect(out.results[0]!.found).toBe(false);
    expect(out.results[0]!.warning).toMatch(/path.*not found/);
    expect(out.specPatch).toBeNull();
    expect(out.secretsPatch).toBeNull();
  });

  describe('stringify', () => {
    it('number 42 → "42"', () => {
      const spec = makeSpec();
      const capture: Capture = { path: 'n', setVar: 'token' };
      const out = applyCaptures(spec, [capture], { n: 42 });
      expect(out.results[0]!.value).toBe('42');
    });

    it('boolean true → "true"', () => {
      const spec = makeSpec();
      const capture: Capture = { path: 'b', setVar: 'token' };
      const out = applyCaptures(spec, [capture], { b: true });
      expect(out.results[0]!.value).toBe('true');
    });

    it('null → "null"', () => {
      const spec = makeSpec();
      const capture: Capture = { path: 'n', setVar: 'token' };
      const out = applyCaptures(spec, [capture], { n: null });
      expect(out.results[0]!.value).toBe('null');
    });

    it('object {a:1} → \'{"a":1}\'', () => {
      const spec = makeSpec();
      const capture: Capture = { path: 'obj', setVar: 'token' };
      const out = applyCaptures(spec, [capture], { obj: { a: 1 } });
      expect(out.results[0]!.value).toBe('{"a":1}');
    });

    it('array [1,2] → \'[1,2]\'', () => {
      const spec = makeSpec();
      const capture: Capture = { path: 'arr', setVar: 'token' };
      const out = applyCaptures(spec, [capture], { arr: [1, 2] });
      expect(out.results[0]!.value).toBe('[1,2]');
    });
  });

  it('multiple captures: one non-secret + one secret + one missing path → 3 results, patched correctly', () => {
    const spec = makeSpec();
    const captures: Capture[] = [
      { path: 'data.token', setVar: 'token' },
      { path: 'data.secret', setVar: 'apiSecret' },
      { path: 'data.missing', setVar: 'token' },
    ];
    const body = { data: { token: 'tok', secret: 'sec' } };

    const out = applyCaptures(spec, captures, body);

    expect(out.results).toHaveLength(3);
    expect(out.results[0]).toMatchObject({ found: true, value: 'tok' });
    expect(out.results[1]).toMatchObject({ found: true, value: 'sec' });
    expect(out.results[2]).toMatchObject({ found: false });

    expect(out.specPatch).not.toBeNull();
    expect(out.specPatch!.environments['default']!.variables[0]!.value).toBe('tok');

    expect(out.secretsPatch).toEqual({ apiSecret: 'sec' });
  });

  it('capture envName targeting secret in non-active env → warning "cannot set secret in non-active env"', () => {
    const spec = makeSpec({
      extraEnvs: {
        staging: [{ name: 'stagingSecret', value: '', secret: true }],
      },
    });
    const capture: Capture = { path: 'data.x', setVar: 'stagingSecret', envName: 'staging' };
    const body = { data: { x: 'value' } };

    const out = applyCaptures(spec, [capture], body);

    expect(out.results).toHaveLength(1);
    expect(out.results[0]!.found).toBe(false);
    expect(out.results[0]!.warning).toMatch(/cannot set secret in non-active env/);
    expect(out.specPatch).toBeNull();
    expect(out.secretsPatch).toBeNull();
  });
});
