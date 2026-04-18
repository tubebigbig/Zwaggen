import { expect, test } from 'vitest';
import { toCurl } from '../../src/runner/curl';
import type { BuiltRequest } from '../../src/runner/send';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeBuilt(partial: Partial<BuiltRequest> = {}): BuiltRequest {
  return {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: {},
    bodyText: undefined,
    useProxy: false,
    missingVars: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Method
// ---------------------------------------------------------------------------

test('method explicit for GET: output contains -X GET', () => {
  const cmd = toCurl(makeBuilt({ method: 'GET' }));
  expect(cmd).toContain('-X GET');
});

test('method explicit for POST: output contains -X POST', () => {
  const cmd = toCurl(makeBuilt({ method: 'POST' }));
  expect(cmd).toContain('-X POST');
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

test('header rendering: each header on its own continuation line, POSIX-quoted', () => {
  const cmd = toCurl(makeBuilt({
    headers: { 'content-type': 'application/json', 'x-api-key': 'abc' },
  }));
  expect(cmd).toContain("-H 'content-type: application/json'");
  expect(cmd).toContain("-H 'x-api-key: abc'");
  // Each on its own continuation line
  expect(cmd).toContain('\\\n');
});

test("shell quoting — apostrophe in value: O'Reilly renders correctly", () => {
  const cmd = toCurl(makeBuilt({
    headers: { 'x-org': "O'Reilly" },
  }));
  // POSIX single-quote escape: 'O'\''Reilly'
  expect(cmd).toContain("'x-org: O'\\''Reilly'");
});

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

test('body: JSON string passed through q; object keys preserved', () => {
  const body = JSON.stringify({ name: 'Alice', age: 30 });
  const cmd = toCurl(makeBuilt({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    bodyText: body,
  }));
  expect(cmd).toContain('--data-raw');
  // The full JSON wrapped in single quotes
  expect(cmd).toContain(`'${body}'`);
  // Object keys preserved inside the JSON
  expect(cmd).toContain('"name"');
  expect(cmd).toContain('"age"');
});

test('no body: command omits --data-raw', () => {
  const cmd = toCurl(makeBuilt({ bodyText: undefined }));
  expect(cmd).not.toContain('--data-raw');
});

// ---------------------------------------------------------------------------
// Secret masking
// ---------------------------------------------------------------------------

test('secret mask: raw value replaced by placeholder everywhere it appears', () => {
  const cmd = toCurl(
    makeBuilt({
      headers: { Authorization: 'Bearer abc123' },
      url: 'https://api.example.com/users?key=abc123',
    }),
    { secretMask: { abc123: '$TOKEN' } },
  );
  expect(cmd).not.toContain('abc123');
  expect(cmd).toContain('$TOKEN');
});

test('secret mask: non-secret values pass through untouched', () => {
  const cmd = toCurl(
    makeBuilt({ headers: { 'x-other': 'visible' } }),
    { secretMask: { abc123: '$TOKEN' } },
  );
  expect(cmd).toContain('visible');
});

test('secret mask with multiple secrets: both raws replaced correctly', () => {
  const cmd = toCurl(
    makeBuilt({
      headers: { Authorization: 'Bearer tok1', 'x-key': 'tok2' },
    }),
    { secretMask: { tok1: '$TOK1', tok2: '$TOK2' } },
  );
  expect(cmd).not.toContain('tok1');
  expect(cmd).not.toContain('tok2');
  expect(cmd).toContain('$TOK1');
  expect(cmd).toContain('$TOK2');
});

test('empty secret value skipped: mask entry with raw === "" is ignored', () => {
  // If empty string were replaced every occurrence of '' would be replaced,
  // corrupting the output. Ensure it's a no-op.
  const cmd = toCurl(
    makeBuilt({ headers: { 'x-h': 'hello' } }),
    { secretMask: { '': '$EMPTY' } },
  );
  expect(cmd).toContain('hello');
  // Sanity: $EMPTY should not appear
  expect(cmd).not.toContain('$EMPTY');
});

// ---------------------------------------------------------------------------
// Proxy comment
// ---------------------------------------------------------------------------

test('proxy comment absent when proxyOn is false', () => {
  const cmd = toCurl(makeBuilt(), { proxyOn: false });
  expect(cmd).not.toContain('#');
});

test('proxy comment present when proxyOn is true', () => {
  const cmd = toCurl(makeBuilt(), { proxyOn: true });
  expect(cmd.startsWith('#')).toBe(true);
  expect(cmd).toContain('Proxy mode is on');
});

test('proxy comment absent when proxyOn is omitted', () => {
  const cmd = toCurl(makeBuilt());
  expect(cmd).not.toContain('#');
});
