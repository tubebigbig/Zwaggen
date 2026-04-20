import {
  sendRequest,
  evaluateAssertions,
  type Spec,
  type RunResult,
  type AssertionResult,
} from '@zwaggen/core';
import { validate, type ValidationError } from '../validator/validate';
import { loadHistory, pushHistory, trimResult } from '../storage/history';
import { loadSecrets } from '../storage/drafts';

export interface BatchRow {
  endpointId: string;
  method: string;
  path: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'errored';
  result?: RunResult;
  validationErrors?: ValidationError[];
  assertionResults?: AssertionResult[];
  passed?: boolean;
  skippedReason?: string;
}

export function runAll(
  spec: Spec,
  proxyUrl: string | undefined,
  onRowChange: (row: BatchRow) => void,
): { cancel: () => void; done: Promise<void> } {
  let cancelled = false;
  const cancel = () => { cancelled = true; };

  const done = (async () => {
    for (const endpoint of spec.endpoints) {
      if (cancelled) return;

      const baseRow: BatchRow = {
        endpointId: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        status: 'running',
      };

      const history = await loadHistory(endpoint.id);
      const last = history[0];
      if (!last) {
        onRowChange({ ...baseRow, status: 'skipped', skippedReason: 'no history yet' });
        continue;
      }

      onRowChange(baseRow);

      const secrets = (await loadSecrets())[spec.activeEnvironment] ?? {};

      let res: RunResult;
      try {
        res = await sendRequest({
          spec,
          endpoint,
          baseUrl: last.baseUrlUsed,
          inputs: last.inputs,
          secrets,
          useProxy: last.useProxyUsed,
          proxyUrl,
        });
      } catch (e) {
        onRowChange({ ...baseRow, status: 'errored' });
        continue;
      }

      let validationErrors: ValidationError[] = [];
      if (res.status != null) {
        const match = endpoint.responses.find((r) => r.status === res.status);
        if (match && res.body !== undefined) {
          validationErrors = validate(spec, match.type, res.body);
        }
      }
      const assertionResults = evaluateAssertions(res, endpoint.assertions);
      const passed =
        res.ok &&
        validationErrors.length === 0 &&
        assertionResults.every((a) => a.passed);

      await pushHistory({
        id: crypto.randomUUID(),
        at: Date.now(),
        endpointId: endpoint.id,
        inputs: last.inputs,
        baseUrlUsed: last.baseUrlUsed,
        useProxyUsed: last.useProxyUsed,
        result: trimResult(res, validationErrors),
      });

      onRowChange({
        ...baseRow,
        status: res.error ? 'errored' : 'done',
        result: res,
        validationErrors,
        assertionResults,
        passed,
      });
    }
  })();

  return { cancel, done };
}
