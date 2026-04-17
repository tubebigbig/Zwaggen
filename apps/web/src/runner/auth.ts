import { AuthPreset } from '../schema/types';

export interface AuthContext { headers: Record<string, string>; url: URL }

export function applyAuth(ctx: AuthContext, auth: AuthPreset): AuthContext {
  const next = { headers: { ...ctx.headers }, url: new URL(ctx.url) };
  switch (auth.type) {
    case 'none': return next;
    case 'bearer':
      next.headers['Authorization'] = `Bearer ${auth.token}`;
      return next;
    case 'basic':
      next.headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
      return next;
    case 'apiKey':
      if (auth.in === 'header') next.headers[auth.name] = auth.value;
      else next.url.searchParams.set(auth.name, auth.value);
      return next;
  }
}
