import { readFile } from 'node:fs/promises';
import {
  evaluateAssertions,
  fromJSON,
  sendRequest,
} from '@zwaggen/core';
import type { Endpoint, RunInputs, Spec } from '@zwaggen/core';

export interface RunOptions {
  baseUrl?: string;
  filter?: string;
}

export async function runCommand(specPath: string, opts: RunOptions): Promise<number> {
  let spec: Spec;
  try {
    spec = fromJSON(JSON.parse(await readFile(specPath, 'utf8')));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  const baseUrl = opts.baseUrl ?? spec.info.baseUrl;
  if (!baseUrl) {
    console.error('error: no base URL (spec has no info.baseUrl and --base-url not given)');
    return 2;
  }

  const endpoints = filterEndpoints(spec.endpoints, opts.filter);

  let passed = 0;
  let failed = 0;

  for (const endpoint of endpoints) {
    const inputs = buildDefaultInputs(endpoint);
    const label = `${endpoint.method} ${endpoint.path}`;
    try {
      const result = await sendRequest({
        spec,
        endpoint,
        baseUrl,
        inputs,
        secrets: {},
        useProxy: false,
      });

      if (result.error) {
        const msg = result.error.kind === 'other'
          ? `${result.error.kind}: ${result.error.message}`
          : `${result.error.kind}: ${result.error.hint}`;
        console.log(`FAIL ${label} — ${msg}`);
        failed++;
        continue;
      }

      const assertionResults = evaluateAssertions(result, endpoint.assertions);
      const assertionFails = assertionResults.filter((a) => !a.passed);
      if (assertionFails.length > 0) {
        const reasons = assertionFails.map((a) => a.message).join('; ');
        console.log(`FAIL ${label} — assertion failed: ${reasons}`);
        failed++;
        continue;
      }

      console.log(`PASS ${label} — ${result.status ?? '?'} in ${result.latencyMs ?? 0}ms`);
      passed++;
    } catch (err) {
      console.log(`FAIL ${label} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log('');
  console.log(`${passed}/${passed + failed} endpoints passed`);
  return failed > 0 ? 1 : 0;
}

function filterEndpoints(endpoints: Endpoint[], pattern: string | undefined): Endpoint[] {
  if (!pattern) return endpoints;
  const re = new RegExp(pattern);
  return endpoints.filter((e) => re.test(`${e.method} ${e.path}`));
}

function buildDefaultInputs(endpoint: Endpoint): RunInputs {
  const pathParams: Record<string, string> = {};
  for (const p of endpoint.pathParams) pathParams[p.name] = '1';
  return {
    path: pathParams,
    query: {},
    headers: {},
    body: undefined,
  };
}
