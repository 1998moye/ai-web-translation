import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const EXTENSION_PATH = path.resolve('.output-fake/chrome-mv3');
const FIXTURE_URL = 'http://127.0.0.1:4321/article.html';

/**
 * ticket 01 的本地加载验证：
 * - Chromium（Chrome for Testing）与 Edge 由这里自动验证；
 * - 系统 Chrome 137+ 不再接受 --load-extension，按 README 手动加载已解压扩展。
 */
const AUTOMATED_CHANNELS = ['chromium', 'msedge'] as const;

for (const channel of AUTOMATED_CHANNELS) {
  test(`本地加载扩展并完成健康检查：${channel}`, async () => {
    test.setTimeout(120_000);

    const context = await chromium.launchPersistentContext('', {
      channel,
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });

    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 30_000 }));
      const extensionId = new URL(worker.url()).host;

      const page = await context.newPage();
      await page.goto(FIXTURE_URL);
      await expect(page.locator('.aiwt-fab-main')).toBeVisible({ timeout: 20_000 });

      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
      await expect(optionsPage.getByRole('heading', { name: 'AI 网页翻译' })).toBeVisible();
      await expect(optionsPage.locator('.aiwt-health')).toContainText('扩展后台已连接');
    } finally {
      await context.close();
    }
  });
}

test('本地加载扩展：系统 Chrome（受限时跳过并提示手动加载）', async () => {
  test.setTimeout(120_000);

  const context = await chromium.launchPersistentContext('', {
    channel: 'chrome',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  try {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    const loaded = await page
      .locator('.aiwt-fab-main')
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    test.skip(
      !loaded,
      '系统 Chrome 137+ 不再接受 --load-extension 参数；请按 README 的“本地加载”步骤在 chrome://extensions 手动加载已解压扩展。',
    );

    await expect(page.locator('.aiwt-fab-main')).toBeVisible();
  } finally {
    await context.close();
  }
});
