import { Spec, TypeDef, ObjectType, RefType } from './types';
import { childOf, splitKey, joinKey } from './folders';

export type Usage =
  | { kind: 'endpoint'; endpointId: string; label: string }
  | { kind: 'type'; typeName: string; label: string };

export function buildUsageIndex(spec: Spec): Record<string, Usage[]> {
  const out: Record<string, Usage[]> = {};
  const push = (name: string, u: Usage) => {
    (out[name] ??= []).push(u);
  };

  const visit = (t: TypeDef, onRef: (refName: string) => void) => {
    walk(t, (sub) => {
      if (sub.kind === 'ref') onRef(sub.ref);
      return sub;
    });
  };

  // Types — skip self-refs while walking each type's body.
  for (const [containing, t] of Object.entries(spec.types)) {
    visit(t, (refName) => {
      if (refName === containing) return;
      push(refName, { kind: 'type', typeName: containing, label: containing });
    });
  }

  // Endpoints — one Usage per occurrence, with section-qualified labels.
  for (const e of spec.endpoints) {
    const base = `${e.method} ${e.path}`;
    const add = (refName: string, sectionLabel: string) =>
      push(refName, {
        kind: 'endpoint',
        endpointId: e.id,
        label: `${base} · ${sectionLabel}`,
      });

    if (e.requestBody) visit(e.requestBody, (r) => add(r, 'requestBody'));
    e.pathParams.forEach((p, i) => visit(p.type, (r) => add(r, `pathParams[${i}]`)));
    visitParamTarget(e.queryParams, 'queryParams', (r, label) => add(r, label));
    visitParamTarget(e.headers, 'headers', (r, label) => add(r, label));
    e.responses.forEach((r, i) => visit(r.type, (rf) => add(rf, `responses[${i}]`)));
  }

  return out;
}

/**
 * Walk a v7 query/header param target (`ObjectType | RefType | undefined`)
 * and call `onRef` for every type ref reachable from it. The `RefType`
 * itself is reported as a ref at the top of the slot (label = `${slot}`),
 * and inline-object fields report each field's refs at
 * `${slot}.${fieldName}`. Mirrors the pre-v7 walk that did one ParamDef
 * per param.
 */
function visitParamTarget(
  target: ObjectType | RefType | undefined,
  slot: string,
  onRef: (refName: string, label: string) => void,
): void {
  if (!target) return;
  if (target.kind === 'ref') {
    onRef(target.ref, slot);
    return;
  }
  if (target.kind === 'object') {
    target.fields.forEach((f) => {
      walk(f.type, (sub) => {
        if (sub.kind === 'ref') onRef(sub.ref, `${slot}.${f.name}`);
        return sub;
      });
    });
  }
}

function rewriteParamTarget(
  target: ObjectType | RefType | undefined,
  rewrite: (t: TypeDef) => TypeDef,
): ObjectType | RefType | undefined {
  if (!target) return target;
  if (target.kind === 'ref') {
    const next = rewrite(target);
    return next as RefType | ObjectType;
  }
  return {
    ...target,
    fields: target.fields.map((f) => ({ ...f, type: walk(f.type, rewrite) })),
  };
}

function walk(t: TypeDef, fn: (t: TypeDef) => TypeDef): TypeDef {
  const next = fn(t);
  switch (next.kind) {
    case 'array':
      return { ...next, element: walk(next.element, fn) };
    case 'object':
      return { ...next, fields: next.fields.map((f) => ({ ...f, type: walk(f.type, fn) })) };
    case 'union':
      return { ...next, variants: next.variants.map((v) => walk(v, fn)) };
    default:
      return next;
  }
}

export function renameType(spec: Spec, from: string, to: string): Spec {
  if (!spec.types[from] || from === to) return spec;
  const rewrite = (t: TypeDef): TypeDef =>
    t.kind === 'ref' && t.ref === from ? { ...t, ref: to } : t;

  const types: Record<string, TypeDef> = {};
  for (const [k, v] of Object.entries(spec.types)) {
    const newKey = k === from ? to : k;
    let rewrittenBody = walk(v, rewrite);
    if (rewrittenBody.kind === 'object' && rewrittenBody.extends && rewrittenBody.extends.length > 0) {
      const nextExtends = rewrittenBody.extends.map((p) => (p === from ? to : p));
      rewrittenBody = { ...rewrittenBody, extends: nextExtends };
    }
    types[newKey] = rewrittenBody;
  }

  const endpoints = spec.endpoints.map((e) => {
    const next = {
      ...e,
      requestBody: e.requestBody ? walk(e.requestBody, rewrite) : null,
      pathParams: e.pathParams.map((p) => ({ ...p, type: walk(p.type, rewrite) })),
      queryParams: rewriteParamTarget(e.queryParams, rewrite),
      headers: rewriteParamTarget(e.headers, rewrite),
      responses: e.responses.map((r) => ({ ...r, type: walk(r.type, rewrite) })),
    };
    if (next.queryParams === undefined) delete next.queryParams;
    if (next.headers === undefined) delete next.headers;
    return next;
  });

  return { ...spec, types, endpoints };
}

export interface BrokenRef { location: string; ref: string }

/**
 * Bulk-rewrite every type key, type ref, and endpoint.folder whose path is
 * `oldFolder` or a descendant, producing an equivalent spec under `newFolder`.
 *
 * Implemented as a sequence of single-key `renameType` calls so ref rewriting
 * reuses the existing plumbing. A no-op if nothing matches.
 *
 * Arguments must be canonical folder paths (output of `normalizeFolder`) or `''`.
 * `newFolder === ''` is the valid "move to root" case. Caller is responsible for
 * detecting destination-key collisions before calling — on collision the victim
 * is silently overwritten (same contract as `renameType`).
 */
export function renameFolder(spec: Spec, oldFolder: string, newFolder: string): Spec {
  if (oldFolder === newFolder || !oldFolder) return spec;

  // 1. Types: collect every key whose folder prefix matches, build the target key.
  //    Sort by path depth descending so we rename leaves first — avoids transient
  //    collisions when old/new prefixes overlap (e.g. oldFolder='auth' and
  //    newFolder='authv2', or newFolder is a descendant of oldFolder).
  const keys = Object.keys(spec.types).filter((k) => {
    const { folder } = splitKey(k);
    return folder === oldFolder || (folder != null && folder.startsWith(`${oldFolder}/`));
  });
  keys.sort((a, b) => b.split('/').length - a.split('/').length);

  let out = spec;
  for (const oldKey of keys) {
    const { folder, name } = splitKey(oldKey);
    const newSubFolder = rewritePath(folder!, oldFolder, newFolder);
    const newKey = joinKey(newSubFolder || undefined, name);
    out = renameType(out, oldKey, newKey);
  }

  // 2. Endpoints: rewrite `folder` on every matching endpoint. When the
  //    rewrite collapses to the root (empty string), drop the field entirely
  //    so the endpoint matches the "no folder" shape exactly.
  out = {
    ...out,
    endpoints: out.endpoints.map((e) => {
      if (!e.folder) return e;
      if (e.folder === oldFolder || e.folder.startsWith(`${oldFolder}/`)) {
        const next = rewritePath(e.folder, oldFolder, newFolder);
        if (next) return { ...e, folder: next };
        const { folder: _dropped, ...rest } = e;
        return rest;
      }
      return e;
    }),
  };

  return out;
}

/**
 * Given a path that either equals `oldFolder` or begins with `oldFolder + '/'`,
 * rewrite it so `oldFolder` is replaced by `newFolder`. Handles `newFolder === ''`
 * (move to root) by stripping the leading slash that would otherwise remain.
 */
function rewritePath(path: string, oldFolder: string, newFolder: string): string {
  if (path === oldFolder) return newFolder;
  const suffix = path.slice(oldFolder.length); // starts with '/'
  if (!newFolder) return suffix.slice(1); // drop leading '/'
  return newFolder + suffix;
}

// Re-export so the UI can share the same predicate; not used internally here.
export { childOf };

export function collectBrokenRefs(spec: Spec): BrokenRef[] {
  const known = new Set(Object.keys(spec.types));
  const out: BrokenRef[] = [];
  const visit = (t: TypeDef, location: string) => {
    walk(t, (sub) => {
      if (sub.kind === 'ref' && !known.has(sub.ref)) out.push({ location, ref: sub.ref });
      return sub;
    });
  };
  for (const [name, t] of Object.entries(spec.types)) {
    visit(t, `types:${name}`);
    // Report any extends[] parent that's missing or not an object.
    if (t.kind === 'object' && t.extends) {
      t.extends.forEach((parentKey, i) => {
        const parent = spec.types[parentKey];
        if (!parent) {
          out.push({ location: `types:${name}:extends[${i}]`, ref: parentKey });
        } else if (parent.kind !== 'object') {
          out.push({ location: `types:${name}:extends[${i}] (not an object)`, ref: parentKey });
        }
      });
    }
  }
  for (const e of spec.endpoints) {
    if (e.requestBody) visit(e.requestBody, `endpoint:${e.id}:requestBody`);
    e.pathParams.forEach((p, i) => visit(p.type, `endpoint:${e.id}:pathParams[${i}]`));
    visitParamTargetRefs(e.queryParams, `endpoint:${e.id}:queryParams`, visit);
    visitParamTargetRefs(e.headers, `endpoint:${e.id}:headers`, visit);
    e.responses.forEach((r, i) => visit(r.type, `endpoint:${e.id}:responses[${i}]`));
  }
  return out;
}

/**
 * Helper for `collectBrokenRefs` — visits a v7 query/header param target.
 * For RefType, visits the ref node directly (so a missing ref is reported
 * at the slot). For inline ObjectType, visits each field's type at
 * `${slot}.${fieldName}`.
 */
function visitParamTargetRefs(
  target: ObjectType | RefType | undefined,
  slot: string,
  visit: (t: TypeDef, location: string) => void,
): void {
  if (!target) return;
  if (target.kind === 'ref') {
    visit(target, slot);
    return;
  }
  if (target.kind === 'object') {
    target.fields.forEach((f) => visit(f.type, `${slot}.${f.name}`));
  }
}
