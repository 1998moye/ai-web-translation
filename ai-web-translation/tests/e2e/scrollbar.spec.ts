import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const EXTENSION_PATH = path.resolve(process.env.AIWT_EXTENSION_PATH ?? '.output-fake/chrome-mv3');

/**
 * 经典滚动条会占用布局宽度。这里用独立浏览器上下文强制非覆盖式滚动条，
 * 验证贴边角色停在内容区边缘，而不是滑到滚动条下面。
 */
test('有经典滚动条时贴边角色不被滚动条遮住', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 900, height: 700 },
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--disable-features=OverlayScrollbar',
    ],
  });

  try {
    const page = await context.newPage();
    await page.goto('/scrollbar.html');

    const fab = page.locator('.aiwt-fab-main');
    const root = page.locator('.aiwt-fab');
    await expect(fab).toBeVisible();

    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.innerWidth - metrics.clientWidth).toBeGreaterThan(0);

    const box = await fab.boundingBox();
    if (!box) throw new Error('缺少按钮位置');
    const centerY = box.y + box.height / 2;

    await page.mouse.move(box.x + box.width / 2, centerY);
    await page.mouse.down();
    await page.mouse.move(metrics.clientWidth - 4, centerY, { steps: 12 });
    await page.mouse.up();
    await page.mouse.move(10, 10);
    await page.waitForTimeout(700);

    await expect(root).toHaveAttribute('data-aiwt-edge-x', 'right');
    await expect(page.locator('.aiwt-fab-grip')).toHaveCount(0);

    const rest = await fab.boundingBox();
    if (!rest) throw new Error('缺少探头位置');
    expect(rest.x).toBeLessThan(metrics.clientWidth);
    expect(metrics.clientWidth - rest.x).toBeGreaterThanOrEqual(25);

    // 悬停时完整滑出，右边缘仍停在内容区，不进入滚动条。
    await page.mouse.move(rest.x + 12, centerY);
    await expect(page.locator('.aiwt-fab-panel')).toBeVisible();
    await expect
      .poll(async () => {
        const full = await fab.boundingBox();
        return full ? full.x + full.width <= metrics.clientWidth + 2 : false;
      })
      .toBe(true);
  } finally {
    await context.close();
  }
});
