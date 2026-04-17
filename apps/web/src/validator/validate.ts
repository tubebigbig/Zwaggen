import type { Spec, TypeDef } from '../schema/types';

export interface ValidationError { path: string; message: string }

export function validate(spec: Spec, type: TypeDef, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  check(spec, type, value, '', errors);
  return errors;
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function deref(spec: Spec, t: TypeDef): TypeDef | null {
  let cur: TypeDef = t;
  while (cur.kind === 'ref') {
    const next = spec.types[cur.ref];
    if (!next) return null;
    cur = next;
  }
  return cur;
}

function check(spec: Spec, t: TypeDef, v: unknown, path: string, errs: ValidationError[]): void {
  const push = (message: string, subPath = path): void => {
    errs.push({ path: subPath, message });
  };

  if (t.kind === 'ref') {
    const resolved = deref(spec, t);
    if (!resolved) return push(`unknown type '${t.ref}'`);
    return check(spec, resolved, v, path, errs);
  }

  switch (t.kind) {
    case 'string': {
      if (typeof v !== 'string') return push(`expected string, got ${typeName(v)}`);
      if (t.minLength != null && v.length < t.minLength) push(`minLength ${t.minLength}`);
      if (t.maxLength != null && v.length > t.maxLength) push(`maxLength ${t.maxLength}`);
      if (t.pattern && !new RegExp(t.pattern).test(v)) push(`pattern ${t.pattern}`);
      if (t.enum && !t.enum.includes(v)) push(`enum mismatch (allowed: ${t.enum.join(', ')})`);
      return;
    }
    case 'number':
    case 'integer': {
      if (typeof v !== 'number' || Number.isNaN(v)) return push(`expected ${t.kind}, got ${typeName(v)}`);
      if (t.kind === 'integer' && !Number.isInteger(v)) return push('expected integer');
      if (t.min != null && v < t.min) push(`min ${t.min}`);
      if (t.max != null && v > t.max) push(`max ${t.max}`);
      if (t.enum && !t.enum.includes(v)) push(`enum mismatch`);
      return;
    }
    case 'boolean':
      if (typeof v !== 'boolean') push(`expected boolean, got ${typeName(v)}`);
      return;
    case 'null':
      if (v !== null) push(`expected null, got ${typeName(v)}`);
      return;
    case 'literal':
      if (v !== t.value) push(`expected literal ${JSON.stringify(t.value)}, got ${JSON.stringify(v)}`);
      return;
    case 'array': {
      if (!Array.isArray(v)) return push(`expected array, got ${typeName(v)}`);
      if (t.minItems != null && v.length < t.minItems) push(`minItems ${t.minItems}`);
      if (t.maxItems != null && v.length > t.maxItems) push(`maxItems ${t.maxItems}`);
      v.forEach((item, i) => check(spec, t.element, item, `${path}[${i}]`, errs));
      return;
    }
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return push(`expected object, got ${typeName(v)}`);
      const obj = v as Record<string, unknown>;
      const allowed = new Set(t.fields.map((f) => f.name));
      for (const f of t.fields) {
        const child = path ? `${path}.${f.name}` : f.name;
        if (!(f.name in obj)) {
          if (f.required) errs.push({ path: child, message: 'missing required field' });
          continue;
        }
        check(spec, f.type, obj[f.name], child, errs);
      }
      if (t.strict) {
        for (const k of Object.keys(obj)) {
          if (!allowed.has(k)) errs.push({ path: path ? `${path}.${k}` : k, message: 'unknown field' });
        }
      }
      return;
    }
    case 'union': {
      for (const variant of t.variants) {
        const sub: ValidationError[] = [];
        check(spec, variant, v, path, sub);
        if (sub.length === 0) return;
      }
      push(`none of ${t.variants.length} union variants matched`);
      return;
    }
  }
}
