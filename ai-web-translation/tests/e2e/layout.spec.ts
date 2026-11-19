import { expect } from '@playwright/test';
import { resetExtensionStorage, test } from './helpers/extension';

test.beforeEach(async ({ serviceWorker, page }) => {
  await resetExtensionStorage(serviceWorker);
  await page.goto('/layout.html');
});

test('图表、flex 行、绝对定位和固定高度卡片不插入译文块', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  await fab.click();
  await expect(fab).toHaveAttribute('aria-label', '恢复原文');

  const counts = await page.evaluate(() => ({
    normal: document.querySelectorAll('#normal + [data-aiwt="body-translation"]').length,
    tableCell: document.querySelectorAll('#model-cell [data-aiwt="body-translation"]').length,
    chart: document.querySelectorAll('#chart [data-aiwt="body-translation"]').length,
    flexRow: document.querySelectorAll('#flex-row [data-aiwt="body-translation"]').length,
    absolute: document.querySelectorAll('#absolute [data-aiwt="body-translation"]').length,
    clipped: document.querySelectorAll('#clipped + [data-aiwt="body-translation"]').length,
  }));

  expect(counts.normal).toBe(1);
  expect(counts.tableCell).toBe(1);
  expect(counts.chart).toBe(0);
  expect(counts.flexRow).toBe(0);
  expect(counts.absolute).toBe(0);
  expect(counts.clipped).toBe(0);
});
