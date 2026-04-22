import { describe, it, expect } from 'vitest';
import { format } from '../../src/generate/format.js';

describe('format', () => {
  it('formats messy TS into canonical form', async () => {
    // Long enough to force prettier to wrap onto multiple lines (printWidth=100).
    const out = await format(
      'export   type Foo={firstFieldName:string;secondFieldName:  number;thirdFieldName:boolean;fourthFieldName:string}',
    );
    expect(out).toContain('export type Foo = {');
    expect(out).toContain('firstFieldName: string;');
    expect(out).toContain('secondFieldName: number;');
  });

  it('is deterministic — same input → identical output', async () => {
    const input = 'export const x: number = 1';
    const a = await format(input);
    const b = await format(input);
    expect(a).toBe(b);
  });

  it('uses single quotes', async () => {
    const out = await format('export const s: string = "hi"');
    expect(out).toContain("'hi'");
    expect(out).not.toContain('"hi"');
  });

  it('emits trailing commas', async () => {
    // Long enough to force a multi-line array literal where trailingComma applies.
    const out = await format(
      "export const items = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu'];",
    );
    expect(out).toMatch(/'mu',\s*\n\];/);
  });
});
