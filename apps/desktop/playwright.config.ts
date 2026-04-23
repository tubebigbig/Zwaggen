import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    headless: false, // Electron windows need a real display; CI sets DISPLAY accordingly
  },
  workers: 1, // single Electron instance
});
