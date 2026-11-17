import { expect } from '@playwright/test';
import { openFabPanel, resetExtensionStorage, test } from './helpers/extension';

test.beforeEach(async ({ serviceWorker, page }) => {
  await resetExtensionStorage(serviceWorker);
  await page.goto('/article.html');
});

test('点击悬浮按钮翻译正文，保留原文并可恢复', async ({ page }) => {
  const fab = page.locator('.aiwt-fab-main');
  await fab.click();

  const translations = page.locator('[data-aiwt="body-translation"]');
  await expect(translations).toHaveCount(5);
  await expect(page.locator('#first + [data-aiwt="body-translation"]')).toContainText(
    '【模拟译文】The quick brown fox',
  );
  await expect(page.locator('#first')).toContainText('The quick brown fox');
  await expect(fab).toHaveAttribute('aria-label', '恢复原文');
  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'completed');

  // 已有中文与非英文段落不产生译文
  await expect(page.locator('#chinese + [data-aiwt="body-translation"]')).toHaveCount(0);
  await expect(page.locator('#french + [data-aiwt="body-translation"]')).toHaveCount(0);

  await fab.click();
  await expect(translations).toHaveCount(0);
  await expect(fab).toHaveAttribute('aria-label', '翻译此页');

  // 再次翻译不会在同一个段落下插入重复译文
  await fab.click();
  await expect(translations).toHaveCount(5);
});

test('表单标签翻译，输入内容与页面行为不受影响', async ({ page }) => {
  await page.locator('.aiwt-fab-main').click();

  const label = page.locator('form label');
  await expect(label).toContainText('【模拟译文】Email address');
  await expect(label.locator('#email')).toHaveCount(1);
  await expect(page.locator('#email')).toHaveValue('typed@example.com');

  const submit = page.locator('form button[type="submit"]');
  await expect(submit).toContainText('【模拟译文】Subscribe');
  await expect(submit.locator('svg')).toHaveCount(1);

  await page.locator('.aiwt-fab-main').click();
  await expect(label).toContainText('Email address');
  await expect(label.locator('#email')).toHaveCount(1);
});

test('界面文本译文优先，悬停可查看原文，并可恢复', async ({ page }) => {
  await page.locator('.aiwt-fab-main').click();

  const docsLink = page.locator('nav a');
  const signIn = page.locator('nav button');
  await expect(docsLink).toHaveText('【模拟译文】Documentation');
  await expect(docsLink).toHaveAttribute('title', 'Documentation');
  await expect(docsLink).toHaveAttribute('href', '/article.html');
  await expect(signIn).toHaveText('【模拟译文】Sign in');

  // 页面自身的样式与结构保持不变（按钮仍是网页的按钮）
  await expect
    .poll(async () => signIn.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 105, 180)');

  await page.locator('.aiwt-fab-main').click();
  await expect(docsLink).toHaveText('Documentation');
  await expect(docsLink).not.toHaveAttribute('title');
});

test('代码内容保持英文并在译文中作为代码呈现', async ({ page }) => {
  await page.locator('.aiwt-fab-main').click();

  const block = page.locator('#second + [data-aiwt="body-translation"]');
  await expect(block.locator('code')).toHaveText('npm install');
  await expect(block.locator('a')).toHaveAttribute('href', '/article.html');
  await expect(page.locator('#second code')).toHaveText('npm install');
});

test('动态新增内容与原文变化自动处理', async ({ page }) => {
  await page.goto('/dynamic.html');
  await page.locator('.aiwt-fab-main').click();

  const translations = page.locator('[data-aiwt="body-translation"]');
  await expect(translations).toHaveCount(2);

  await expect(page.locator('#added + [data-aiwt="body-translation"]')).toContainText(
    '【模拟译文】A paragraph added by the website',
    { timeout: 25_000 },
  );

  await expect(page.locator('#changing + [data-aiwt="body-translation"]')).toContainText(
    'was replaced with new English text',
    { timeout: 25_000 },
  );
  await expect(
    page.locator('[data-aiwt="body-translation"]', { hasText: 'will change after a moment' }),
  ).toHaveCount(0);
});

test('按网站自动翻译只对英文页面生效，恢复后不重复触发', async ({ page }) => {
  const translations = page.locator('[data-aiwt="body-translation"]');

  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '此网站自动翻译' }).click();
  await expect(
    page.locator('.aiwt-fab-panel').getByRole('button', { name: '关闭此网站自动翻译' }),
  ).toBeVisible();

  await page.reload();
  await expect(translations).toHaveCount(5, { timeout: 25_000 });

  // 同一完整域名下的法语页面不自动翻译
  await page.goto('/french.html');
  await expect(page.locator('.aiwt-fab-main')).toHaveAttribute('aria-label', '翻译此页');
  await page.waitForTimeout(1200);
  await expect(translations).toHaveCount(0);

  // 恢复原文后，同一次页面停留不再自动翻译
  await page.goto('/article.html');
  await expect(translations).toHaveCount(5, { timeout: 25_000 });
  await page.locator('.aiwt-fab-main').click();
  await expect(translations).toHaveCount(0);

  await page.evaluate(() => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Content added after the user restored the original page.';
    document.querySelector('main')?.append(paragraph);
  });
  await page.waitForTimeout(1200);
  await expect(translations).toHaveCount(0);
});
