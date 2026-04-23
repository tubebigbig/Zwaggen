import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = resolve(__dirname, '..', '..', 'electron-builder.yml');

test('electron-builder.yml parses and has the expected app identity', () => {
  const cfg = parse(readFileSync(cfgPath, 'utf8'));
  expect(cfg.appId).toBe('com.zwaggen.desktop');
  expect(cfg.productName).toBe('Zwaggen');
  expect(cfg.mac.identity).toBeNull();
  expect(cfg.mac.target).toEqual([{ target: 'dmg', arch: ['arm64', 'x64'] }]);
  expect(cfg.win.target.map((t: { target: string }) => t.target)).toEqual(['nsis', 'zip']);
  expect(cfg.linux.target).toEqual([{ target: 'AppImage', arch: ['x64'] }]);
  expect(cfg.extraResources).toEqual([{ from: '../web/dist', to: 'web' }]);
});
