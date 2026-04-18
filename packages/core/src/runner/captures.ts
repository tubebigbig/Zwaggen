import type { Spec, Capture } from '../schema/types';
import { extractByPath } from './path';

export interface CaptureResult {
  capture: Capture;
  found: boolean;
  value?: string;
  warning?: string;
}

export interface ApplyCapturesOutput {
  results: CaptureResult[];
  specPatch: Spec | null;
  secretsPatch: Record<string, string> | null;
}

export function applyCaptures(
  spec: Spec,
  captures: Capture[] | undefined,
  body: unknown,
): ApplyCapturesOutput {
  if (!captures || captures.length === 0) {
    return { results: [], specPatch: null, secretsPatch: null };
  }

  const results: CaptureResult[] = [];
  let specMut = spec;
  let mutated = false;
  const secretsPatch: Record<string, string> = {};
  let anySecret = false;

  for (const capture of captures) {
    const envName = capture.envName ?? spec.activeEnvironment;
    const env = specMut.environments[envName];
    if (!env) {
      results.push({ capture, found: false, warning: `env "${envName}" not found` });
      continue;
    }

    const varIndex = env.variables.findIndex((v) => v.name === capture.setVar);
    if (varIndex === -1) {
      results.push({ capture, found: false, warning: `env var "${capture.setVar}" not defined` });
      continue;
    }

    const { value, found } = extractByPath(body, capture.path);
    if (!found) {
      results.push({ capture, found: false, warning: `path "${capture.path}" not found in body` });
      continue;
    }

    const stringified = stringify(value);
    const variable = env.variables[varIndex]!;

    if (variable.secret) {
      // Only update the active env's secrets-patch; secrets are per-env.
      if (envName === spec.activeEnvironment) {
        secretsPatch[capture.setVar] = stringified;
        anySecret = true;
      } else {
        // Captures targeting a different env's secret are not supported in MVP.
        results.push({ capture, found: false, warning: `cannot set secret in non-active env "${envName}"` });
        continue;
      }
    } else {
      // Non-secret: mutate specMut.environments[envName].variables[i].value.
      const newVariables = env.variables.map((v, i) =>
        i === varIndex ? { ...v, value: stringified } : v
      );
      const newEnv = { ...env, variables: newVariables };
      specMut = {
        ...specMut,
        environments: { ...specMut.environments, [envName]: newEnv },
      };
      mutated = true;
    }

    results.push({ capture, found: true, value: stringified });
  }

  return {
    results,
    specPatch: mutated ? specMut : null,
    secretsPatch: anySecret ? secretsPatch : null,
  };
}

function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
