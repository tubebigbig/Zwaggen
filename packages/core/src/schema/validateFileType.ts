// packages/core/src/schema/validateFileType.ts
// Walks a Spec and flags illegal placements of `FileType` (`{ kind: 'file' }`).
// File type is ONLY valid inside an Endpoint's `bodyForm` when
// `bodyContentType === 'multipart'`. Any other location (named types, request
// bodies, responses, path/query/header params, urlencoded form fields, or
// nested under array/object/union containers) is rejected at codegen +
// OpenAPI export time.

import type { Spec, TypeDef } from './types';

export interface FileTypePlacementError {
  /** Dotted path identifying the illegal placement. */
  where: string;
  /** Human-readable explanation. */
  message: string;
}

/** Recursively detects whether a type tree contains a FileType anywhere. */
function containsFileType(def: TypeDef): boolean {
  if (def.kind === 'file') return true;
  if (def.kind === 'array') return containsFileType(def.element);
  if (def.kind === 'object') return def.fields.some((f) => containsFileType(f.type));
  if (def.kind === 'union') return def.variants.some(containsFileType);
  return false;
}

/**
 * Walks the Spec and returns an array of every illegal FileType placement.
 * Returns an empty array when the spec is valid (the only legal placement is
 * top-level fields inside a multipart bodyForm).
 *
 * Callers (codegen, OpenAPI export) should throw with the joined messages
 * when this returns a non-empty list.
 */
export function findIllegalFileTypes(spec: Spec): FileTypePlacementError[] {
  const errors: FileTypePlacementError[] = [];

  for (const [name, def] of Object.entries(spec.types)) {
    if (containsFileType(def)) {
      errors.push({
        where: `types.${name}`,
        message: 'file type not allowed in named types (only top-level fields of multipart bodyForm)',
      });
    }
  }

  for (const ep of spec.endpoints) {
    if (ep.requestBody && containsFileType(ep.requestBody)) {
      errors.push({
        where: `endpoints.${ep.id}.requestBody`,
        message: 'file type not allowed in requestBody (only top-level fields of multipart bodyForm)',
      });
    }
    for (const r of ep.responses) {
      if (containsFileType(r.type)) {
        errors.push({
          where: `endpoints.${ep.id}.responses[${r.status}]`,
          message: 'file type not allowed in responses',
        });
      }
    }
    for (const p of ep.pathParams) {
      if (containsFileType(p.type)) {
        errors.push({
          where: `endpoints.${ep.id}.pathParams.${p.name}`,
          message: 'file type not allowed in path params',
        });
      }
    }
    for (const p of ep.queryParams) {
      if (containsFileType(p.type)) {
        errors.push({
          where: `endpoints.${ep.id}.queryParams.${p.name}`,
          message: 'file type not allowed in query params',
        });
      }
    }
    for (const p of ep.headers) {
      if (containsFileType(p.type)) {
        errors.push({
          where: `endpoints.${ep.id}.headers.${p.name}`,
          message: 'file type not allowed in headers',
        });
      }
    }

    if (ep.bodyForm) {
      const ct = ep.bodyContentType ?? 'json';
      if (ct !== 'multipart') {
        for (const p of ep.bodyForm) {
          if (containsFileType(p.type)) {
            errors.push({
              where: `endpoints.${ep.id}.bodyForm.${p.name}`,
              message: `file type only valid for multipart endpoints (current bodyContentType: ${ct})`,
            });
          }
        }
      } else {
        // Multipart: top-level file fields are OK. Nested file types
        // (file inside array/object/union) are not — the picker can only
        // produce a flat field=File pair.
        for (const p of ep.bodyForm) {
          if (p.type.kind !== 'file' && containsFileType(p.type)) {
            errors.push({
              where: `endpoints.${ep.id}.bodyForm.${p.name}`,
              message: 'file type cannot be nested inside array/object/union; use it as the field type directly',
            });
          }
        }
      }
    }
  }

  return errors;
}
