import { expect } from '@playwright/test';
import { openFabPanel, resetExtensionStorage, test } from './helpers/extension';

test('设置页展示页签、后台状态与两类独立的网站偏好', async ({ page, extensionContext, extensionId, serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
  await page.goto('/article.html');

  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '此网站自动翻译' }).click();
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '此网站永久关闭按钮' }).click();
  await expect(page.locator('.aiwt-fab-main')).toHaveCount(0);

  const optionsPage = await extensionContext.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(optionsPage.getByRole('heading', { name: 'AI 网页翻译' })).toBeVisible();
  await expect(optionsPage.locator('.aiwt-health')).toContainText('扩展后台已连接');
  await expect(optionsPage.getByRole('link', { name: /翻译服务/ })).toHaveAttribute('aria-current', 'page');

  await optionsPage.getByRole('link', { name: /网站偏好/ }).click();
  const autoSection = optionsPage.locator('section[aria-labelledby="aiwt-auto-translate-heading"]');
  const disabledSection = optionsPage.locator('section[aria-labelledby="aiwt-disabled-button-heading"]');

  await expect(autoSection.getByText('127.0.0.1')).toBeVisible();
  await expect(disabledSection.getByText('127.0.0.1')).toBeVisible();

  await autoSection.getByRole('button', { name: '移除 127.0.0.1 的自动翻译' }).click();
  await expect(autoSection.getByText('还没有自动翻译网站。')).toBeVisible();
  await expect(disabledSection.getByText('127.0.0.1')).toBeVisible();

  await disabledSection.getByRole('button', { name: '恢复 127.0.0.1 的悬浮按钮' }).click();
  await expect(disabledSection.getByText('没有永久关闭悬浮按钮的网站。')).toBeVisible();

  await optionsPage.close();
});
