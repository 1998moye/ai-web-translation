import { defineConfig } from '@playwright/test';

/**
 * 生产装配的端到端验改：加载 `.output` 构建，使用真实的 Translation Engine
 * 与后台传输，翻译服务指向可控的 mock Chat Completions 端点。
 */
process.env.AIWT_EXTENSION_PATH = '.output/chrome-mv3';

export default defineConfig({
  testDir: 'tests/e2e-production',
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
