import type { RunResult } from './send';
import type { Assertions } from '../schema/types';

export interface AssertionResult {
  kind: 'status' | 'latency' | 'header';
  passed: boolean;
  message: string;
}

export function evaluateAssertions(res: RunResult, a?: Assertions): AssertionResult[] {
  if (!a) return [];
  const out: AssertionResult[] = [];

  if (a.expectedStatus !== undefined) {
    const passed = res.status === a.expectedStatus;
    out.push({
      kind: 'status',
      passed,
      message: passed
        ? `Status ${a.expectedStatus}`
        : `Expected ${a.expectedStatus}, got ${res.status ?? '?'}`,
    });
  }

  if (a.maxLatencyMs !== undefined && res.latencyMs !== undefined) {
    const passed = res.latencyMs <= a.maxLatencyMs;
    out.push({
      kind: 'latency',
      passed,
      message: passed
        ? `≤ ${a.maxLatencyMs}ms (${res.latencyMs}ms)`
        : `Too slow: ${res.latencyMs}ms > ${a.maxLatencyMs}ms`,
    });
  }

  if (a.requiredHeaders?.length) {
    const lookup = Object.fromEntries(
      Object.entries(res.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    for (const h of a.requiredHeaders) {
      const got = lookup[h.name.toLowerCase()];
      const passed = got === h.value;
      out.push({
        kind: 'header',
        passed,
        message: passed
          ? `${h.name}: ${h.value}`
          : got === undefined
            ? `Missing ${h.name}`
            : `${h.name}: expected "${h.value}", got "${got}"`,
      });
    }
  }

  return out;
}
