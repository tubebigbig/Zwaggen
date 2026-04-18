import { describe, it, expect } from 'vitest';
import { evaluateAssertions } from '../../src/runner/assertions';
import type { RunResult } from '../../src/runner/send';

function makeRes(partial: Partial<RunResult>): RunResult {
  return { ok: true, missingVars: [], ...partial };
}

describe('evaluateAssertions', () => {
  it('returns [] when assertions arg is undefined', () => {
    expect(evaluateAssertions(makeRes({ status: 200 }), undefined)).toEqual([]);
  });

  it('returns [] when assertions block has no fields set', () => {
    expect(evaluateAssertions(makeRes({ status: 200 }), {})).toEqual([]);
  });

  describe('expectedStatus', () => {
    it('passes when status matches', () => {
      const results = evaluateAssertions(makeRes({ status: 200 }), { expectedStatus: 200 });
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ kind: 'status', passed: true, message: 'Status 200' });
    });

    it('fails when status does not match', () => {
      const results = evaluateAssertions(makeRes({ status: 404 }), { expectedStatus: 200 });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ kind: 'status', passed: false, message: 'Expected 200, got 404' });
    });

    it('fails with "got ?" when res.status is undefined', () => {
      const results = evaluateAssertions(makeRes({}), { expectedStatus: 200 });
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
      expect(results[0]!.message).toContain('got ?');
    });
  });

  describe('maxLatencyMs', () => {
    it('passes when latency is within limit', () => {
      const results = evaluateAssertions(makeRes({ latencyMs: 50 }), { maxLatencyMs: 200 });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ kind: 'latency', passed: true });
    });

    it('fails when latency exceeds limit', () => {
      const results = evaluateAssertions(makeRes({ latencyMs: 500 }), { maxLatencyMs: 200 });
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        kind: 'latency',
        passed: false,
        message: 'Too slow: 500ms > 200ms',
      });
    });

    it('skips latency assertion when res.latencyMs is undefined', () => {
      const results = evaluateAssertions(makeRes({}), { maxLatencyMs: 200 });
      expect(results).toHaveLength(0);
    });
  });

  describe('requiredHeaders', () => {
    it('passes when header name and value match exactly', () => {
      const results = evaluateAssertions(
        makeRes({ headers: { 'content-type': 'application/json' } }),
        { requiredHeaders: [{ name: 'content-type', value: 'application/json' }] },
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ kind: 'header', passed: true });
    });

    it('passes with case-insensitive header name lookup', () => {
      const results = evaluateAssertions(
        makeRes({ headers: { 'Content-Type': 'application/json' } }),
        { requiredHeaders: [{ name: 'content-type', value: 'application/json' }] },
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ kind: 'header', passed: true });
    });

    it('fails when header value case does not match (values are case-sensitive)', () => {
      const results = evaluateAssertions(
        makeRes({ headers: { 'content-type': 'Application/JSON' } }),
        { requiredHeaders: [{ name: 'content-type', value: 'application/json' }] },
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ kind: 'header', passed: false });
    });

    it('reports "Missing X" when header is absent', () => {
      const results = evaluateAssertions(
        makeRes({ headers: {} }),
        { requiredHeaders: [{ name: 'X-Api-Key', value: 'abc' }] },
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ kind: 'header', passed: false, message: 'Missing X-Api-Key' });
    });

    it('produces no header results for empty requiredHeaders array', () => {
      const results = evaluateAssertions(
        makeRes({ headers: { 'content-type': 'application/json' } }),
        { requiredHeaders: [] },
      );
      expect(results).toHaveLength(0);
    });

    it('produces one result per entry with multiple failing headers', () => {
      const results = evaluateAssertions(
        makeRes({ headers: {} }),
        {
          requiredHeaders: [
            { name: 'X-Api-Key', value: 'abc' },
            { name: 'X-Request-Id', value: '123' },
          ],
        },
      );
      expect(results).toHaveLength(2);
      expect(results.every((r) => !r.passed)).toBe(true);
    });
  });
});
