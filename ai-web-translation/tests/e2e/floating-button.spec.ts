import { expect } from '@playwright/test';
import { openFabPanel, resetExtensionStorage, test } from './helpers/extension';

test.beforeEach(async ({ serviceWorker, page }) => {
  await resetExtensionStorage(serviceWorker);
  await page.goto('/article.html');
});

test('默认显示悬浮按钮，样式与网页隔离', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  await expect(fab).toBeVisible();
  await expect(fab).toHaveAttribute('aria-label', '翻译此页');
  await expect(page.getByText('开发演示 · 模拟翻译')).toBeVisible();

  // 网页 CSS 把 button 设成 hotpink、无圆角；Shadow DOM 内的按钮不受影响。
  await expect
    .poll(async () => fab.evaluate((element) => getComputedStyle(element).borderRadius))
    .toBe('50%');
  await expect
    .poll(async () => fab.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe('rgb(255, 105, 180)');

  // 默认位置：右侧中下部
  const box = await fab.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('缺少按钮或视口尺寸');
  expect(box.x).toBeGreaterThan(viewport.width / 2);
  expect(box.y).toBeGreaterThan(viewport.height / 3);
});

test('拖动按钮后位置在所有网站保持不变，且不会误触翻译', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  const box = await fab.boundingBox();
  if (!box) throw new Error('缺少按钮位置');

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 90, startY - 150, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(12, 12);
  await page.waitForTimeout(550);

  await expect(page.locator('[data-aiwt="body-translation"]')).toHaveCount(0);
  await expect(fab).toHaveAttribute('aria-label', '翻译此页');

  const moved = await fab.boundingBox();
  if (!moved) throw new Error('拖动后缺少按钮位置');
  expect(moved.y).toBeLessThan(box.y - 100);

  await page.reload();
  await expect(fab).toBeVisible();
  await expect
    .poll(async () => {
      const afterReload = await fab.boundingBox();
      return afterReload ? Math.abs(afterReload.y - moved.y) : null;
    })
    .toBeLessThanOrEqual(2);

  // 另一个完整域名也使用同一份全局位置
  await page.goto('http://localhost:4321/article.html');
  await expect
    .poll(async () => {
      const otherSite = await page.locator('.aiwt-fab-main').boundingBox();
      return otherSite ? Math.abs(otherSite.y - moved.y) : null;
    })
    .toBeLessThanOrEqual(2);

  // 拖动结束后点击仍会正常触发翻译，不会被拖动状态吞掉
  await page.locator('.aiwt-fab-main').click();
  await expect(page.locator('[data-aiwt="body-translation"]')).toHaveCount(5);
});

test('贴边的角色会定时探头，探头时露出完整表情和两只扒边的手', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  const root = page.locator('.aiwt-fab');
  const box = await fab.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('缺少按钮或视口尺寸');

  const centerY = 360;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width - 2, centerY, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(10, 10);

  await expect(root).toHaveAttribute('data-aiwt-edge-x', 'right');
  await expect(root).toHaveAttribute('data-aiwt-hand-x', 'right');
  await expect(page.locator('.aiwt-fab-grip')).toHaveCount(2);
  await expect(page.locator('.aiwt-fab-grip-finger')).toHaveCount(6);
  await expect(page.locator('.aiwt-fab-grip-thumb')).toHaveCount(2);
  await expect(page.locator('.aiwt-fab-grip-upper')).toBeVisible();

  // 译/原是头顶的小装饰；贴边和探头时都应完整露在头部上沿。
  const restSign = await page.locator('.aiwt-fab-sign').boundingBox();
  const restFab = await fab.boundingBox();
  const handBoxes = await page
    .locator('.aiwt-fab-grip')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
  if (!restSign || !restFab || handBoxes.length !== 2) throw new Error('缺少徽章或手的位置');
  expect(restSign.x).toBeGreaterThanOrEqual(0);
  expect(restSign.x + restSign.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(restSign.y).toBeGreaterThanOrEqual(0);
  expect(restSign.y).toBeLessThan(restFab.y + restFab.height / 2);
  expect(handBoxes[0].top).toBeLessThan(handBoxes[1].top);

  // 第一次自动探头约在 2 秒后开始；探头后应从 36px 静态露出扩到 44px。
  await expect(root).toHaveAttribute('data-aiwt-peeking', 'true', { timeout: 6000 });
  await expect
    .poll(async () => {
      const peek = await fab.boundingBox();
      return peek ? viewport.width - peek.x >= 40 : false;
    })
    .toBe(true);
});

test('拖到视口边缘后藏在屏幕外探头，悬停完整弹出', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  const root = page.locator('.aiwt-fab');
  const box = await fab.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('缺少按钮或视口尺寸');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width - 2, viewport.height - 2, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(650);

  await expect(root).toHaveAttribute('data-aiwt-edge-x', 'right');
  await expect(root).toHaveAttribute('data-aiwt-edge-y', 'bottom');

  // 侧面探头：水平方向有 26px 藏在屏幕外；上下不切脸，底边仍留在视口内。
  const peek = await fab.boundingBox();
  if (!peek) throw new Error('缺少探头位置');
  expect(peek.x + peek.width).toBeGreaterThan(viewport.width);
  expect(peek.y + peek.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(viewport.width - peek.x).toBeGreaterThanOrEqual(30);

  const restSign = await page.locator('.aiwt-fab-sign').boundingBox();
  if (!restSign) throw new Error('缺少徽章位置');
  expect(restSign.x).toBeGreaterThanOrEqual(0);
  expect(restSign.x + restSign.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(restSign.y).toBeGreaterThanOrEqual(0);
  expect(restSign.y).toBeLessThan(peek.y + peek.height / 2);

  // 悬停后完整滑出，贴住屏幕边缘，不再被裁切。
  await fab.hover();
  await expect
    .poll(async () => {
      const revealed = await fab.boundingBox();
      return revealed
        ? revealed.x + revealed.width <= viewport.width + 3 &&
            revealed.y + revealed.height <= viewport.height + 3
        : false;
    })
    .toBe(true);

  const revealed = await fab.boundingBox();
  if (!revealed) throw new Error('缺少展开位置');
  expect(revealed.x + revealed.width).toBeLessThanOrEqual(viewport.width + 3);
  expect(revealed.y + revealed.height).toBeLessThanOrEqual(viewport.height + 3);

  // 角色已经完整滑出来，扒边的小手收回去，不悬在按钮旁边。
  await expect(page.locator('.aiwt-fab-grips')).toHaveCSS('opacity', '0');
});

test('窗口缩小时按钮贴边探头，悬停后完整可见', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  await expect(fab).toBeVisible();

  await page.setViewportSize({ width: 420, height: 360 });
  await page.waitForTimeout(650);

  const peek = await fab.boundingBox();
  if (!peek) throw new Error('缺少按钮位置');
  // 贴边后允许一部分藏在屏幕外，但必须留下足够可见、可悬停的区域。
  expect(peek.x).toBeLessThan(420);
  expect(peek.y).toBeLessThan(360);
  expect(420 - peek.x).toBeGreaterThanOrEqual(30);
  expect(360 - peek.y).toBeGreaterThanOrEqual(40);

  await fab.hover();
  await expect
    .poll(async () => {
      const box = await fab.boundingBox();
      if (!box) return false;
      return box.x >= 0 && box.y >= 0 && box.x + box.width <= 423 && box.y + box.height <= 363;
    })
    .toBe(true);
});

test('按钮拖到左侧时展开面板仍在视口内', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  const box = await fab.boundingBox();
  if (!box) throw new Error('缺少按钮位置');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(20, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(500);

  const viewport = page.viewportSize();
  const restSign = await page.locator('.aiwt-fab-sign').boundingBox();
  const restFab = await fab.boundingBox();
  if (!viewport || !restSign || !restFab) throw new Error('缺少徽章位置');
  expect(restSign.x).toBeGreaterThanOrEqual(0);
  expect(restSign.x + restSign.width).toBeLessThanOrEqual(viewport.width);
  expect(restSign.y).toBeGreaterThanOrEqual(0);
  expect(restSign.y).toBeLessThan(restFab.y + restFab.height / 2);

  await openFabPanel(page);
  const panelBox = await page.locator('.aiwt-fab-panel').boundingBox();
  const buttonBox = await fab.boundingBox();
  const signBox = await page.locator('.aiwt-fab-sign').boundingBox();
  if (!panelBox || !buttonBox || !signBox) throw new Error('缺少面板或按钮位置');

  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width);
  // 完整展开后，装饰仍在头部上沿，而不是落回按钮下方。
  expect(signBox.y).toBeLessThan(buttonBox.y + buttonBox.height / 2);
  expect(signBox.x).toBeGreaterThanOrEqual(0);
});

test('按钮靠近顶部时面板向下展开且不超出视口', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  const box = await fab.boundingBox();
  if (!box) throw new Error('缺少按钮位置');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(40, 24, { steps: 12 });
  await page.mouse.up();

  await openFabPanel(page);
  const panelBox = await page.locator('.aiwt-fab-panel').boundingBox();
  const viewport = page.viewportSize();
  if (!panelBox || !viewport) throw new Error('缺少面板位置');

  expect(panelBox.y).toBeGreaterThanOrEqual(0);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(viewport.height);
});

test('键盘聚焦展开面板，Esc 关闭且不误触翻译', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  const panel = page.locator('.aiwt-fab-panel');

  await fab.focus();
  await expect(panel).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('[data-aiwt="body-translation"]')).toHaveCount(0);
});

test('悬停展开设置与关闭入口', async ({ page }) => {
  await openFabPanel(page);
  const panel = page.locator('.aiwt-fab-panel');

  await expect(panel.getByRole('button', { name: '设置' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '关闭一次' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '此网站永久关闭按钮' })).toBeVisible();
  await expect(panel.getByText('关闭一次只隐藏当前页面；永久关闭按完整域名保存，可在设置页恢复。')).toBeVisible();
  await expect(panel.getByText(/扩展后台已连接/)).toBeVisible();
});

test('设置入口打开扩展设置页', async ({ page, extensionContext }) => {
  await openFabPanel(page);

  const optionsPagePromise = extensionContext.waitForEvent('page');
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '设置' }).click();
  const optionsPage = await optionsPagePromise;
  await optionsPage.waitForLoadState('domcontentloaded');

  await expect(optionsPage).toHaveURL(/options\.html$/);
  await expect(optionsPage.getByRole('heading', { name: 'AI 网页翻译' })).toBeVisible();
  await optionsPage.close();
});

test('关闭一次只隐藏当前页面，刷新后恢复', async ({ page }) => {
  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '关闭一次' }).click();
  await expect(page.locator('.aiwt-fab-main')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.aiwt-fab-main')).toBeVisible();
});

test('永久关闭按完整域名保存，并可在设置页移除', async ({ page, extensionContext, extensionId }) => {
  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '此网站永久关闭按钮' }).click();
  await expect(page.locator('.aiwt-fab-main')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.aiwt-fab-main')).toHaveCount(0);

  // 同主域的另一个完整域名不受影响
  await page.goto('http://localhost:4321/article.html');
  await expect(page.locator('.aiwt-fab-main')).toBeVisible();

  const optionsPage = await extensionContext.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.getByRole('link', { name: /网站偏好/ }).click();

  const disabledSection = optionsPage.locator('section[aria-labelledby="aiwt-disabled-button-heading"]');
  const autoSection = optionsPage.locator('section[aria-labelledby="aiwt-auto-translate-heading"]');
  await expect(disabledSection.getByText('127.0.0.1')).toBeVisible();
  await expect(autoSection.getByText('127.0.0.1')).toHaveCount(0);

  await disabledSection.getByRole('button', { name: '恢复 127.0.0.1 的悬浮按钮' }).click();
  await expect(disabledSection.getByText('没有永久关闭悬浮按钮的网站。')).toBeVisible();
  await optionsPage.close();

  await page.goto('http://127.0.0.1:4321/article.html');
  await expect(page.locator('.aiwt-fab-main')).toBeVisible();
});
