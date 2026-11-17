import { expect } from '@playwright/test';
import { resetExtensionStorage, test } from './helpers/extension';

/**
 * 划词翻译端到端验收：使用生产装配（真实 Translation Engine + 后台传输），
 * 翻译服务指向可控的 mock Chat Completions 端点。
 */
const CHAT_URL = 'http://127.0.0.1:4321/mock/chat/completions';

test.beforeEach(async ({ serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
});

async function saveDefaultProfile(page: import('@playwright/test').Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill('本地模拟服务');
  await page.getByLabel('模型名').fill('mock-model');
  await page.getByLabel('请求地址').fill(CHAT_URL);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.aiwt-profile-item')).toHaveCount(1);
}

test('划词后显示图标，点击后才请求翻译并显示气泡', async ({ page, extensionId }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/article.html');

  const paragraph = page.locator('#first');
  await paragraph.selectText();

  const icon = page.locator('.aiwt-selection-icon');
  await expect(icon).toBeVisible();
  // 选区本身不产生请求：气泡还没有出现。
  await expect(page.locator('.aiwt-selection-bubble')).toHaveCount(0);

  await icon.click();

  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText('模拟译文：');
  await expect(bubble).toContainText('The quick brown fox jumps over the lazy dog');
  // 原文保持不变。
  await expect(paragraph).toContainText('The quick brown fox jumps over the lazy dog');
  await expect(paragraph.locator('[data-aiwt]')).toHaveCount(0);
});

test('新选区使旧气泡失效，关闭气泡后不再显示', async ({ page, extensionId }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/article.html');

  await page.locator('#first').selectText();
  await page.locator('.aiwt-selection-icon').click();
  await expect(page.locator('.aiwt-selection-bubble')).toContainText('模拟译文：');

  await page.locator('#last').selectText();
  await expect(page.locator('.aiwt-selection-bubble')).toHaveCount(0);
  await expect(page.locator('.aiwt-selection-icon')).toBeVisible();

  await page.locator('.aiwt-selection-icon').click();
  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toContainText('Another English paragraph');

  await bubble.getByRole('button', { name: '关闭译文气泡' }).click();
  await expect(page.locator('.aiwt-selection-bubble')).toHaveCount(0);
});

test('已有中文的选区不显示翻译图标', async ({ page, extensionId }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/article.html');

  await page.locator('#chinese').selectText();

  await expect(page.locator('.aiwt-selection-icon')).toHaveCount(0);
  await expect(page.locator('.aiwt-selection-bubble')).toHaveCount(0);
});

test('翻译服务认证失败时气泡显示脱敏错误并保留原文', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill('错误服务');
  await page.getByLabel('模型名').fill('mock-model');
  await page.getByLabel('API Key', { exact: true }).fill('sk-e2e-secret-key-9876');
  await page.getByLabel('请求地址').fill('http://127.0.0.1:4321/mock/chat/unauthorized');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await page.goto('/article.html');
  const paragraph = page.locator('#first');
  await paragraph.selectText();
  await page.locator('.aiwt-selection-icon').click();

  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toHaveAttribute('data-aiwt-status', 'error');
  await expect(bubble).toContainText('认证失败');
  expect(await bubble.textContent()).not.toContain('sk-e2e-secret-key-9876');
  await expect(paragraph).toContainText('The quick brown fox jumps over the lazy dog');
});
