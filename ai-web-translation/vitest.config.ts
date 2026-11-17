import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': srcDir,
      '~': srcDir,
    },
  },
  define: {
    // 单元测试默认按生产装配运行；需要 fake Engine 的测试显式注入。
    __AIWT_FAKE_ENGINE__: 'false',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
