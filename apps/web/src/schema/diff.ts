import type { Spec, Endpoint, ParamDef } from './types';

export interface ChangeEntry {
  kind: string;
  location: string;
  summary: string;
}

export interface SpecDiff {
  breaking: ChangeEntry[];
  nonBreaking: ChangeEntry[];
}

export function diffSpecs(a: Spec, b: Spec): SpecDiff {
  const breaking: ChangeEntry[] = [];
  const nonBreaking: ChangeEntry[] = [];
  diffEndpoints(a, b, breaking, nonBreaking);
  // Types come in Task 2
  sortDeterministic(breaking);
  sortDeterministic(nonBreaking);
  return { breaking, nonBreaking };
}

function sortDeterministic(entries: ChangeEntry[]) {
  entries.sort((x, y) => {
    if (x.kind !== y.kind) return x.kind.localeCompare(y.kind);
    return x.location.localeCompare(y.location);
  });
}

const endpointKey = (e: Endpoint) => `${e.method} ${e.path}`;

function diffEndpoints(
  a: Spec,
  b: Spec,
  breaking: ChangeEntry[],
  nonBreaking: ChangeEntry[],
) {
  const aMap = new Map(a.endpoints.map((e) => [endpointKey(e), e]));
  const bMap = new Map(b.endpoints.map((e) => [endpointKey(e), e]));

  for (const [key] of aMap) {
    if (!bMap.has(key)) {
      breaking.push({
        kind: 'endpoint.removed',
        location: key,
        summary: `Endpoint removed: ${key}`,
      });
    }
  }

  for (const [key, eb] of bMap) {
    if (!aMap.has(key)) {
      nonBreaking.push({
        kind: 'endpoint.added',
        location: key,
        summary: `Endpoint added: ${key}`,
      });
      continue;
    }
    const ea = aMap.get(key)!;
    diffEndpointInPlace(ea, eb, breaking, nonBreaking);
  }
}

function diffEndpointInPlace(
  ea: Endpoint,
  eb: Endpoint,
  breaking: ChangeEntry[],
  nonBreaking: ChangeEntry[],
) {
  const key = endpointKey(ea);

  // Description changed
  const aDesc = ea.description ?? '';
  const bDesc = eb.description ?? '';
  if ((ea.description !== undefined || eb.description !== undefined) && aDesc !== bDesc) {
    nonBreaking.push({
      kind: 'endpoint.description.changed',
      location: key,
      summary: `Endpoint description changed: ${key}`,
    });
  }

  // Tags changed
  const aTags = JSON.stringify(ea.tags ?? []);
  const bTags = JSON.stringify(eb.tags ?? []);
  if (aTags !== bTags) {
    nonBreaking.push({
      kind: 'endpoint.tags.changed',
      location: key,
      summary: `Endpoint tags changed: ${key}`,
    });
  }

  // Params: pathParams, queryParams, headers
  for (const field of ['pathParams', 'queryParams', 'headers'] as const) {
    diffParams(key, ea[field], eb[field], breaking, nonBreaking);
  }

  // Request body
  const aBody = ea.requestBody;
  const bBody = eb.requestBody;
  if (aBody !== null && bBody === null) {
    nonBreaking.push({
      kind: 'endpoint.requestBody.removed',
      location: key,
      summary: `Request body removed: ${key}`,
    });
  } else if (aBody === null && bBody !== null) {
    breaking.push({
      kind: 'endpoint.requestBody.added',
      location: key,
      summary: `Request body added: ${key}`,
    });
  } else if (aBody !== null && bBody !== null) {
    // Coarse type equality via JSON.stringify
    if (JSON.stringify(aBody) !== JSON.stringify(bBody)) {
      breaking.push({
        kind: 'endpoint.requestBody.type.changed',
        location: key,
        summary: `Request body type changed: ${key}`,
      });
    }
  }

  // Responses: match by status
  const aResMap = new Map(ea.responses.map((r) => [r.status, r]));
  const bResMap = new Map(eb.responses.map((r) => [r.status, r]));

  for (const [status] of aResMap) {
    if (!bResMap.has(status)) {
      nonBreaking.push({
        kind: 'endpoint.response.removed',
        location: key,
        summary: `Response status ${status} removed: ${key}`,
      });
    }
  }

  for (const [status, rb] of bResMap) {
    if (!aResMap.has(status)) {
      nonBreaking.push({
        kind: 'endpoint.response.added',
        location: key,
        summary: `Response status ${status} added: ${key}`,
      });
    } else {
      const ra = aResMap.get(status)!;
      // Coarse type equality via JSON.stringify
      if (JSON.stringify(ra.type) !== JSON.stringify(rb.type)) {
        breaking.push({
          kind: 'endpoint.response.type.changed',
          location: key,
          summary: `Response type changed for status ${status}: ${key}`,
        });
      }
    }
  }
}

function diffParams(
  location: string,
  aParams: ParamDef[],
  bParams: ParamDef[],
  breaking: ChangeEntry[],
  nonBreaking: ChangeEntry[],
) {
  const aByName = new Map(aParams.map((p) => [p.name, p]));
  const bByName = new Map(bParams.map((p) => [p.name, p]));

  // Removed params
  for (const [name, pa] of aByName) {
    if (!bByName.has(name)) {
      const loc = `${location} param:${name}`;
      if (pa.required === true) {
        breaking.push({
          kind: 'endpoint.param.removed',
          location: loc,
          summary: `Required param removed: ${name} at ${location}`,
        });
      } else {
        nonBreaking.push({
          kind: 'endpoint.param.removed',
          location: loc,
          summary: `Optional param removed: ${name} at ${location}`,
        });
      }
    }
  }

  // Added params
  for (const [name, pb] of bByName) {
    if (!aByName.has(name)) {
      const loc = `${location} param:${name}`;
      if (pb.required === true) {
        breaking.push({
          kind: 'endpoint.param.required-added',
          location: loc,
          summary: `Required param added: ${name} at ${location}`,
        });
      } else {
        nonBreaking.push({
          kind: 'endpoint.param.optional-added',
          location: loc,
          summary: `Optional param added: ${name} at ${location}`,
        });
      }
    }
  }

  // Changed params
  for (const [name, pa] of aByName) {
    const pb = bByName.get(name);
    if (!pb) continue;
    const loc = `${location} param:${name}`;

    // required flipped
    if (!pa.required && pb.required) {
      breaking.push({
        kind: 'endpoint.param.required-flipped-to-true',
        location: loc,
        summary: `Param required flipped to true: ${name} at ${location}`,
      });
    } else if (pa.required && !pb.required) {
      nonBreaking.push({
        kind: 'endpoint.param.required-flipped-to-false',
        location: loc,
        summary: `Param required flipped to false: ${name} at ${location}`,
      });
    }

    // type changed — coarse JSON.stringify equality
    if (JSON.stringify(pa.type) !== JSON.stringify(pb.type)) {
      breaking.push({
        kind: 'endpoint.param.type.changed',
        location: loc,
        summary: `Param type changed: ${name} at ${location}`,
      });
    }
  }
}
