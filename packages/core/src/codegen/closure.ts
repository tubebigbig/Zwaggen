import type {
  Spec,
  Endpoint,
  TypeDef,
  ObjectType,
  ArrayType,
  UnionType,
} from '../schema/types';

export interface CodegenSlice {
  /** Include only these endpoint IDs. */
  endpointIds?: string[];
  /**
   * Include only these type keys (canonical, e.g. "auth/User" or "User").
   * Transitive references (RefType + extends parents) are pulled in
   * automatically.
   */
  typeKeys?: string[];
  /**
   * Include every endpoint and type whose folder starts with this prefix
   * (canonical form, no leading/trailing slash). 'auth' matches 'auth' and
   * 'auth/oauth', but not 'authentication'.
   */
  folderPrefix?: string;
}

export interface ResolvedSlice {
  endpoints: Endpoint[];
  types: TypeDef[];
  /**
   * Type keys referenced by the slice's endpoints/types but not present in
   * spec.types. Codegen callers can decide whether to fail loudly or emit
   * `unknown` placeholders.
   */
  unresolvedRefs: string[];
}

export function folderMatchesPrefix(folder: string | undefined, prefix: string): boolean {
  if (!folder) return prefix === '';
  if (folder === prefix) return true;
  return folder.startsWith(prefix + '/');
}

function collectRefsFromType(t: TypeDef, into: Set<string>): void {
  switch (t.kind) {
    case 'ref':
      into.add(t.ref);
      return;
    case 'array':
      collectRefsFromType((t as ArrayType).element, into);
      return;
    case 'object': {
      const o = t as ObjectType;
      for (const ext of o.extends ?? []) into.add(ext);
      for (const f of o.fields) collectRefsFromType(f.type, into);
      return;
    }
    case 'union':
      for (const v of (t as UnionType).variants) collectRefsFromType(v, into);
      return;
    default:
      return;
  }
}

function collectRefsFromEndpoint(ep: Endpoint, into: Set<string>): void {
  for (const p of ep.pathParams) collectRefsFromType(p.type, into);
  if (ep.queryParams) collectRefsFromType(ep.queryParams as TypeDef, into);
  if (ep.headers) collectRefsFromType(ep.headers as TypeDef, into);
  if (ep.requestBody) collectRefsFromType(ep.requestBody, into);
  for (const f of ep.bodyForm ?? []) collectRefsFromType(f.type, into);
  for (const r of ep.responses) collectRefsFromType(r.type, into);
}

function folderOfTypeKey(key: string): string | undefined {
  const lastSlash = key.lastIndexOf('/');
  return lastSlash >= 0 ? key.slice(0, lastSlash) : undefined;
}

export function resolveSlice(spec: Spec, slice?: CodegenSlice): ResolvedSlice {
  // Default: full spec
  if (!slice || (!slice.endpointIds && !slice.typeKeys && slice.folderPrefix === undefined)) {
    return {
      endpoints: spec.endpoints.slice(),
      types: Object.values(spec.types),
      unresolvedRefs: [],
    };
  }

  // 1. Initial endpoint set: union of endpointIds + folderPrefix matches
  const endpointIdSet = new Set(slice.endpointIds ?? []);
  const includedEndpoints = spec.endpoints.filter((ep) => {
    if (endpointIdSet.has(ep.id)) return true;
    if (slice.folderPrefix !== undefined && folderMatchesPrefix(ep.folder, slice.folderPrefix)) return true;
    return false;
  });

  // 2. Initial type-key set: union of typeKeys + folderPrefix matches
  const initialTypeKeys = new Set<string>(slice.typeKeys ?? []);
  if (slice.folderPrefix !== undefined) {
    for (const key of Object.keys(spec.types)) {
      if (folderMatchesPrefix(folderOfTypeKey(key), slice.folderPrefix)) {
        initialTypeKeys.add(key);
      }
    }
  }

  // 3. Walk endpoint refs into the worklist
  const refQueue = new Set<string>(initialTypeKeys);
  for (const ep of includedEndpoints) collectRefsFromEndpoint(ep, refQueue);

  // 4. Closure: BFS through type refs + extends parents
  const resolved = new Map<string, TypeDef>();
  const unresolved = new Set<string>();
  const work = Array.from(refQueue);
  while (work.length > 0) {
    const ref = work.shift()!;
    if (resolved.has(ref) || unresolved.has(ref)) continue;
    const t = spec.types[ref];
    if (!t) {
      unresolved.add(ref);
      continue;
    }
    resolved.set(ref, t);
    const downstream = new Set<string>();
    collectRefsFromType(t, downstream);
    for (const d of downstream) {
      if (!resolved.has(d) && !unresolved.has(d)) work.push(d);
    }
  }

  // 5. Order types by spec.types key insertion order (preserves codegen determinism)
  const orderedTypes: TypeDef[] = [];
  for (const key of Object.keys(spec.types)) {
    if (resolved.has(key)) orderedTypes.push(resolved.get(key)!);
  }

  return {
    endpoints: includedEndpoints,
    types: orderedTypes,
    unresolvedRefs: Array.from(unresolved).sort(),
  };
}
