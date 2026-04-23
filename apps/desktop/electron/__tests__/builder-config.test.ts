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
  expect(cfg.dmg.sign).toBe(false);
  expect(cfg.mac.target).toEqual([{ target: 'dmg', arch: ['arm64', 'x64'] }]);
  expect(cfg.win.target).toEqual([
    { target: 'nsis', arch: ['x64'] },
    { target: 'zip', arch: ['x64'] },
  ]);
  expect(cfg.linux.target).toEqual([{ target: 'AppImage', arch: ['x64'] }]);
  expect(cfg.extraResources).toEqual([{
    from: '../web/dist',
    to: 'web',
    filter: ['**/*', '!_headers', '!_redirects'],
  }]);
});

test('electron-builder.yml registers .zwag file association', () => {
  const cfg = parse(readFileSync(cfgPath, 'utf8'));
  expect(cfg.fileAssociations).toEqual([
    {
      ext: 'zwag',
      name: 'Zwaggen Spec',
      description: 'Zwaggen API specification',
      role: 'Editor',
      icon: 'build/icon.icns',
      mimeType: 'application/x-zwaggen-spec',
    },
  ]);
});
