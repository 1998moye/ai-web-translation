import { expect } from '@playwright/test';
import { resetExtensionStorage, test } from './helpers/extension';

test.beforeEach(async ({ serviceWorker, page }) => {
  await resetExtensionStorage(serviceWorker);
  await page.goto('/stack.html');
});

test('纯链接内容标题按正文翻译，紧凑元数据与屏幕阅读器文本不产生译文', async ({ page }) => {
  await page.locator('.aiwt-fab-main').click();

  const titleTranslation = page.locator('.title + [data-aiwt="body-translation"]');
  await expect(titleTranslation).toContainText('【模拟译文】Dereferencing a null pointer undefined behavior?');
  await expect(page.locator('.title')).toContainText('Dereferencing a null pointer undefined behavior?');

  await expect(page.locator('.excerpt + [data-aiwt="body-translation"]')).toContainText(
    '【模拟译文】everyone knows that dereferencing',
  );

  // 紧凑的元数据行不应该在行下插入整块译文。
  await expect(page.locator('.meta + [data-aiwt="body-translation"]')).toHaveCount(0);
  await expect(page.locator('.meta [data-aiwt="body-translation"]')).toHaveCount(0);

  // 纯数字声望徽章与 sr-only 的 reputation 都不应被翻译。
  await expect(page.locator('.rep')).toContainText('59.3k');
  await expect(page.locator('.rep [data-aiwt="body-translation"]')).toHaveCount(0);
  await expect(page.locator('.rep [data-aiwt-translated="true"]')).toHaveCount(0);
  await expect(page.locator('.sr-only')).toHaveText('reputation');
});
