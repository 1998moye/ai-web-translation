import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'off',
  },
  webServer: {
    command: 'node tests/e2e/fixtures-server.mjs',
    url: 'http://127.0.0.1:4321/health',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
