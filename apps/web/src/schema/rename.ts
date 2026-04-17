import { Spec, TypeDef } from './types';

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
    e.queryParams.forEach((p, i) => visit(p.type, (r) => add(r, `queryParams[${i}]`)));
    e.headers.forEach((p, i) => visit(p.type, (r) => add(r, `headers[${i}]`)));
    e.responses.forEach((r, i) => visit(r.type, (rf) => add(rf, `responses[${i}]`)));
  }

  return out;
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
    types[newKey] = walk(v, rewrite);
  }

  const endpoints = spec.endpoints.map((e) => ({
    ...e,
    requestBody: e.requestBody ? walk(e.requestBody, rewrite) : null,
    pathParams: e.pathParams.map((p) => ({ ...p, type: walk(p.type, rewrite) })),
    queryParams: e.queryParams.map((p) => ({ ...p, type: walk(p.type, rewrite) })),
    headers: e.headers.map((p) => ({ ...p, type: walk(p.type, rewrite) })),
    responses: e.responses.map((r) => ({ ...r, type: walk(r.type, rewrite) })),
  }));

  return { ...spec, types, endpoints };
}

export interface BrokenRef { location: string; ref: string }

export function collectBrokenRefs(spec: Spec): BrokenRef[] {
  const known = new Set(Object.keys(spec.types));
  const out: BrokenRef[] = [];
  const visit = (t: TypeDef, location: string) => {
    walk(t, (sub) => {
      if (sub.kind === 'ref' && !known.has(sub.ref)) out.push({ location, ref: sub.ref });
      return sub;
    });
  };
  for (const [name, t] of Object.entries(spec.types)) visit(t, `types:${name}`);
  for (const e of spec.endpoints) {
    if (e.requestBody) visit(e.requestBody, `endpoint:${e.id}:requestBody`);
    e.pathParams.forEach((p, i) => visit(p.type, `endpoint:${e.id}:pathParams[${i}]`));
    e.queryParams.forEach((p, i) => visit(p.type, `endpoint:${e.id}:queryParams[${i}]`));
    e.headers.forEach((p, i) => visit(p.type, `endpoint:${e.id}:headers[${i}]`));
    e.responses.forEach((r, i) => visit(r.type, `endpoint:${e.id}:responses[${i}]`));
  }
  return out;
}
