import path from 'node:path';
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';

export const EXTENSION_PATH = path.resolve('.output-fake/chrome-mv3');

export interface ExtensionWorkerFixtures {
  extensionContext: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}

export interface ExtensionTestFixtures {
  page: Page;
}

/**
 * 使用开发演示构建（fake Translation Engine）加载扩展。
 * 生产装配不包含 fake Adapter，端到端联调由 ticket 19 负责。
 */
export const test = base.extend<ExtensionTestFixtures, ExtensionWorkerFixtures>({
  extensionContext: [
    async ({}, use) => {
      const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
      });
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],
  serviceWorker: [
    async ({ extensionContext }, use) => {
      const worker = extensionContext.serviceWorkers()[0] ?? (await extensionContext.waitForEvent('serviceworker'));
      await use(worker);
    },
    { scope: 'worker' },
  ],
  extensionId: [
    async ({ serviceWorker }, use) => {
      await use(new URL(serviceWorker.url()).host);
    },
    { scope: 'worker' },
  ],
  page: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await use(page);
    if (!page.isClosed()) await page.close();
  },
});

export async function resetExtensionStorage(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: { storage: { local: { clear(): Promise<void> } } } }).chrome;
    await api.storage.local.clear();
  });
}

/** 悬停悬浮按钮以展开设置与关闭入口。 */
export async function openFabPanel(page: Page): Promise<void> {
  await page.locator('.aiwt-fab-main').hover();
  await page.locator('.aiwt-fab-panel').waitFor({ state: 'visible' });
}
