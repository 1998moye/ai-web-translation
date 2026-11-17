import { expect } from '@playwright/test';
import { resetExtensionStorage, test } from '../e2e/helpers/extension';

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

test('已有中文的选区不发起请求，并说明不需要翻译', async ({ page, extensionId }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/article.html');

  await page.locator('#chinese').selectText();

  const icon = page.locator('.aiwt-selection-icon');
  await expect(icon).toHaveAttribute('data-aiwt-available', 'false');

  await icon.click();
  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toHaveAttribute('data-aiwt-status', 'error');
  await expect(bubble).toContainText('中文');
});

test('气泡可以切换翻译服务配置，结果不会混用', async ({ page, extensionId }) => {
  await saveDefaultProfile(page, extensionId);

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill('备选服务');
  await page.getByLabel('模型名').fill('mock-model');
  await page.getByLabel('请求地址').fill('http://127.0.0.1:4321/mock/chat/alt');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.aiwt-profile-item')).toHaveCount(2);

  await page.goto('/article.html');
  await page.locator('#first').selectText();
  await page.locator('.aiwt-selection-icon').click();

  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toContainText('模拟译文：');
  await expect(bubble.locator('.aiwt-selection-profiles select')).toHaveValue(/.+/);

  await bubble.locator('.aiwt-selection-profiles select').selectOption({ label: '备选服务' });

  await expect(bubble).toContainText('备选译文：');
  await expect(bubble).not.toContainText('模拟译文：');
});

test('代码内容不进入翻译请求，行内代码也不会被提交', async ({ page, extensionId }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/article.html');

  // 整个选区落在行内代码上：给出代码不翻译的反馈，且不请求。
  await page.locator('#second code').selectText();
  const icon = page.locator('.aiwt-selection-icon');
  await expect(icon).toHaveAttribute('data-aiwt-available', 'false');
  await icon.click();
  await expect(page.locator('.aiwt-selection-bubble')).toContainText('代码');
  await page.locator('.aiwt-selection-bubble').getByRole('button', { name: '关闭译文气泡' }).click();

  // 包含行内代码的段落：翻译其余文字，行内代码不提交。
  await page.locator('#second').selectText();
  await page.locator('.aiwt-selection-icon').click();

  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toContainText('模拟译文：');
  await expect(bubble).toContainText('Read');
  await expect(bubble).not.toContainText('npm install');
});

test('长选区拆成多个单元，译文按原文顺序逐条显示', async ({ page, extensionId }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/long.html');

  await page.locator('#long').selectText();
  await page.locator('.aiwt-selection-icon').click();

  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toHaveAttribute('data-aiwt-status', 'success');

  const units = bubble.locator('.aiwt-selection-units li');
  await expect(units).toHaveCount(3);
  await expect(units.nth(0)).toContainText('Reading long form documentation');
  await expect(units.nth(1)).toContainText('A reader can consume');
  await expect(units.nth(2)).toContainText('Partial failures keep');
});

test('部分单元缺失译文时成功结果仍然可见', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill('部分失败服务');
  await page.getByLabel('模型名').fill('mock-model');
  await page.getByLabel('请求地址').fill('http://127.0.0.1:4321/mock/chat/partial');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await page.goto('/long.html');
  await page.locator('#long').selectText();
  await page.locator('.aiwt-selection-icon').click();

  const bubble = page.locator('.aiwt-selection-bubble');
  await expect(bubble).toHaveAttribute('data-aiwt-status', 'partial');

  const units = bubble.locator('.aiwt-selection-units li');
  await expect(units.nth(0)).toHaveAttribute('data-aiwt-unit-status', 'error');
  await expect(units.nth(1)).toHaveAttribute('data-aiwt-unit-status', 'done');
  await expect(units.nth(1)).toContainText('模拟译文：');
});

test('翻译服务认证失败时气泡显示脱敏错误并保留原文', async ({ page, extensionId }) => {  await page.goto(`chrome-extension://${extensionId}/options.html`);
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

/** 读取 mock 服务的请求计数，用于观察是否真的产生了翻译请求。 */
async function chatRequests(request: import('@playwright/test').APIRequestContext, scenario: string): Promise<number> {
  const response = await request.get('/mock/stats');
  const stats = (await response.json()) as Record<string, number>;
  return stats[scenario] ?? 0;
}

test('相同原文命中缓存，清空缓存后才重新请求，且不影响配置', async ({ page, extensionId, request }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/article.html');

  const translateFirstParagraph = async (): Promise<void> => {
    await page.locator('#first').selectText();
    await page.locator('.aiwt-selection-icon').click();
    await expect(page.locator('.aiwt-selection-bubble')).toContainText('模拟译文：');
    await page.locator('.aiwt-selection-bubble').getByRole('button', { name: '关闭译文气泡' }).click();
  };

  const before = await chatRequests(request, 'completions');
  await translateFirstParagraph();
  await translateFirstParagraph();
  expect(await chatRequests(request, 'completions')).toBe(before + 1);

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator('.aiwt-cache-count')).toContainText('1');
  await page.getByRole('button', { name: '清空译文缓存' }).click();
  await expect(page.getByText('译文缓存已清空')).toBeVisible();
  await expect(page.locator('.aiwt-cache-count')).toContainText('0');
  // 清空缓存不会删除翻译服务配置。
  await expect(page.locator('.aiwt-profile-item')).toHaveCount(1);

  await page.goto('/article.html');
  await translateFirstParagraph();
  expect(await chatRequests(request, 'completions')).toBe(before + 2);
});

test('切换模型后相同原文不会命中旧缓存', async ({ page, extensionId, request }) => {
  await saveDefaultProfile(page, extensionId);
  await page.goto('/article.html');

  await page.locator('#first').selectText();
  await page.locator('.aiwt-selection-icon').click();
  await expect(page.locator('.aiwt-selection-bubble')).toContainText('模拟译文：');

  const before = await chatRequests(request, 'completions');

  // 换一个模型后再翻译同一段：缓存键包含模型，必须重新请求。
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('.aiwt-profile-item').first().getByRole('button', { name: '编辑' }).click();
  await page.getByLabel('模型名').fill('other-model');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await page.goto('/article.html');
  await page.locator('#first').selectText();
  await page.locator('.aiwt-selection-icon').click();
  await expect(page.locator('.aiwt-selection-bubble')).toContainText('模拟译文：');

  expect(await chatRequests(request, 'completions')).toBe(before + 1);
});
