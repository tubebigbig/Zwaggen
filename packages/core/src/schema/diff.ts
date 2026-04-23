import type { Spec, Endpoint, ObjectType, ObjectField, ParamDef, RefType, TypeDef } from './types';
import { canonicalStringify } from './canonical';
import { resolveObject, InheritanceCycleError } from './resolveObject';
import { resolveParamFields } from '../runner/resolveParamFields';

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
  diffTypes(a, b, breaking, nonBreaking);
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
    diffEndpointInPlace(a, b, ea, eb, breaking, nonBreaking);
  }
}

function diffEndpointInPlace(
  aSpec: Spec,
  bSpec: Spec,
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
  const aTags = canonicalStringify(ea.tags ?? []);
  const bTags = canonicalStringify(eb.tags ?? []);
  if (aTags !== bTags) {
    nonBreaking.push({
      kind: 'endpoint.tags.changed',
      location: key,
      summary: `Endpoint tags changed: ${key}`,
    });
  }

  // Path params (positional, ParamDef[])
  diffParams(`${key} pathParams`, ea.pathParams, eb.pathParams, breaking, nonBreaking);
  // Query and headers — v7 ObjectType | RefType | undefined → resolve to fields
  diffParams(
    `${key} queryParams`,
    resolveParamFields(ea.queryParams, aSpec),
    resolveParamFields(eb.queryParams, bSpec),
    breaking,
    nonBreaking,
  );
  diffParams(
    `${key} headers`,
    resolveParamFields(ea.headers, aSpec),
    resolveParamFields(eb.headers, bSpec),
    breaking,
    nonBreaking,
  );

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
    // Coarse type equality via canonicalStringify
    if (canonicalStringify(aBody) !== canonicalStringify(bBody)) {
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
      // Coarse type equality via canonicalStringify
      if (canonicalStringify(ra.type) !== canonicalStringify(rb.type)) {
        breaking.push({
          kind: 'endpoint.response.type.changed',
          location: key,
          summary: `Response type changed for status ${status}: ${key}`,
        });
      }
    }
  }
}

function collectRefs(t: TypeDef, out: Set<string>) {
  if (t.kind === 'ref') out.add(t.ref);
  else if (t.kind === 'object') for (const f of t.fields) collectRefs(f.type, out);
  else if (t.kind === 'array') collectRefs(t.element, out);
  else if (t.kind === 'union') for (const v of t.variants) collectRefs(v, out);
}

function collectParamTargetRefs(
  target: ObjectType | RefType | undefined,
  out: Set<string>,
): void {
  if (!target) return;
  if (target.kind === 'ref') {
    out.add(target.ref);
    return;
  }
  for (const f of target.fields) collectRefs(f.type, out);
}

function diffTypes(
  a: Spec,
  b: Spec,
  breaking: ChangeEntry[],
  nonBreaking: ChangeEntry[],
) {
  const aNames = new Set(Object.keys(a.types));
  const bNames = new Set(Object.keys(b.types));

  // Build a set of "referenced names" across BOTH specs to decide if a removed
  // type is actually used.
  const referenced = new Set<string>();
  for (const spec of [a, b]) {
    for (const t of Object.values(spec.types)) collectRefs(t, referenced);
    for (const e of spec.endpoints) {
      if (e.requestBody) collectRefs(e.requestBody, referenced);
      for (const p of e.pathParams) collectRefs(p.type, referenced);
      collectParamTargetRefs(e.queryParams, referenced);
      collectParamTargetRefs(e.headers, referenced);
      for (const r of e.responses) collectRefs(r.type, referenced);
    }
  }

  for (const name of aNames) {
    if (!bNames.has(name)) {
      const loc = `types:${name}`;
      if (referenced.has(name)) {
        breaking.push({ kind: 'type.removed', location: loc, summary: `Referenced type removed: ${name}` });
      } else {
        nonBreaking.push({ kind: 'type.removed', location: loc, summary: `Unreferenced type removed: ${name}` });
      }
    }
  }

  for (const name of bNames) {
    if (!aNames.has(name)) {
      nonBreaking.push({ kind: 'type.added', location: `types:${name}`, summary: `Type added: ${name}` });
      continue;
    }
    const ta = a.types[name]!;
    const tb = b.types[name]!;
    diffTypeInPlace(name, resolveForDiff(a, name, ta), resolveForDiff(b, name, tb), breaking, nonBreaking);
  }
}

// When an object type has extends, diff its resolved (flattened) shape so a
// refactor that moves fields between parent and child — with no change to the
// effective type — emits no diff entries. For non-object kinds or objects
// without extends, the type is returned unchanged.
function resolveForDiff(spec: Spec, name: string, t: TypeDef): TypeDef {
  if (t.kind !== 'object') return t;
  if (!t.extends || t.extends.length === 0) return t;
  try {
    const resolved: ObjectType = resolveObject(spec, name);
    return resolved;
  } catch (err) {
    if (err instanceof InheritanceCycleError) return t;
    throw err;
  }
}

function diffTypeInPlace(
  name: string,
  ta: TypeDef,
  tb: TypeDef,
  breaking: ChangeEntry[],
  nonBreaking: ChangeEntry[],
) {
  if (ta.kind !== tb.kind) {
    breaking.push({
      kind: 'type.kind.changed',
      location: `types:${name}`,
      summary: `Type kind changed: ${name} (${ta.kind} → ${tb.kind})`,
    });
    return;
  }

  if (ta.kind === 'object' && tb.kind === 'object') {
    const aByName = new Map(ta.fields.map((f) => [f.name, f]));
    const bByName = new Map(tb.fields.map((f) => [f.name, f]));

    // Removed fields
    for (const [fname] of aByName) {
      if (!bByName.has(fname)) {
        breaking.push({
          kind: 'type.field.removed',
          location: `types:${name}.${fname}`,
          summary: `Field removed: ${fname} in type ${name}`,
        });
      }
    }

    // Added fields
    for (const [fname, fb] of bByName) {
      if (!aByName.has(fname)) {
        if (fb.required) {
          breaking.push({
            kind: 'type.field.added.required',
            location: `types:${name}.${fname}`,
            summary: `Required field added: ${fname} in type ${name}`,
          });
        } else {
          nonBreaking.push({
            kind: 'type.field.added.optional',
            location: `types:${name}.${fname}`,
            summary: `Optional field added: ${fname} in type ${name}`,
          });
        }
        continue;
      }

      // Field exists in both — check required flip and type change
      const fa = aByName.get(fname)!;
      const loc = `types:${name}.${fname}`;

      if (!fa.required && fb.required) {
        breaking.push({
          kind: 'type.field.required-flipped-to-true',
          location: loc,
          summary: `Field required flipped to true: ${fname} in type ${name}`,
        });
      } else if (fa.required && !fb.required) {
        nonBreaking.push({
          kind: 'type.field.required-flipped-to-false',
          location: loc,
          summary: `Field required flipped to false: ${fname} in type ${name}`,
        });
      }

      if (canonicalStringify(fa.type) !== canonicalStringify(fb.type)) {
        breaking.push({
          kind: 'type.field.type.changed',
          location: loc,
          summary: `Field type changed: ${fname} in type ${name}`,
        });
      }
    }
    return;
  }

  // Non-object kinds — coarse catch-all
  if (canonicalStringify(ta) !== canonicalStringify(tb)) {
    breaking.push({
      kind: 'type.changed',
      location: `types:${name}`,
      summary: `Type changed: ${name}`,
    });
  }
}

// ParamDef and ObjectField share { name; required; type; description? }, so
// the diff routine treats them interchangeably.
type ParamLike = Pick<ParamDef, 'name' | 'required' | 'type'>;

function diffParams(
  location: string,
  aParams: readonly ParamLike[],
  bParams: readonly ParamLike[],
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

    // type changed — coarse canonicalStringify equality
    if (canonicalStringify(pa.type) !== canonicalStringify(pb.type)) {
      breaking.push({
        kind: 'endpoint.param.type.changed',
        location: loc,
        summary: `Param type changed: ${name} at ${location}`,
      });
    }
  }
}
