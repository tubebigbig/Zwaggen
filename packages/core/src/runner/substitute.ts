export function substitute(input: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = input.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, name) => {
    if (name in vars) return vars[name]!;
    if (!missing.includes(name)) missing.push(name);
    return m;
  });
  return { text, missing };
}
