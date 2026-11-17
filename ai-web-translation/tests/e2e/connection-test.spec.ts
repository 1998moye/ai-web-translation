import { expect } from '@playwright/test';
import { resetExtensionStorage, test } from './helpers/extension';

const CHAT_URL = 'http://127.0.0.1:4321/mock/chat/completions';

test.beforeEach(async ({ serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
});

async function openNewProfile(page: import('@playwright/test').Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill('本地模拟服务');
  await page.getByLabel('模型名').fill('mock-model');
}

test('测试连接用真实服务验证协议，成功时显示实际译文', async ({ page, extensionId }) => {
  await openNewProfile(page, extensionId);
  await page.getByLabel('请求地址').fill(CHAT_URL);

  await page.getByRole('button', { name: '测试连接' }).click();

  const result = page.locator('.aiwt-test-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('模拟译文');
  await expect(result).toContainText('The quick brown fox jumps over the lazy dog.');
});

test('测试连接区分请求中与请求完成，失败时显示脱敏错误', async ({ page, extensionId }) => {
  await openNewProfile(page, extensionId);
  await page.getByLabel('API Key', { exact: true }).fill('sk-e2e-secret-key-9876');

  // 慢响应期间按钮变为「测试中…」且不可重复点击。
  await page.getByLabel('请求地址').fill('http://127.0.0.1:4321/mock/chat/slow');
  await page.getByRole('button', { name: '测试连接' }).click();
  const running = page.getByRole('button', { name: '测试中…' });
  await expect(running).toBeVisible();
  await expect(running).toBeDisabled();
  await expect(page.locator('.aiwt-test-result')).toContainText('模拟译文');
  await expect(page.getByRole('button', { name: '测试连接' })).toBeEnabled();

  await page.getByLabel('请求地址').fill('http://127.0.0.1:4321/mock/chat/unauthorized');
  const testButton = page.getByRole('button', { name: '测试连接' });
  await testButton.click();

  const failure = page.locator('.aiwt-test-error');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText('认证失败');
  expect(await failure.textContent()).not.toContain('sk-e2e-secret-key-9876');
  await expect(testButton).toBeEnabled();

  // 参数或模型问题（400）直接报告，不当成认证错误。
  await page.getByLabel('请求地址').fill('http://127.0.0.1:4321/mock/chat/bad-request');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.locator('.aiwt-test-error')).toContainText('被拒绝');

  // 响应结构不符时提示协议问题，而不是当成成功。
  await page.getByLabel('请求地址').fill('http://127.0.0.1:4321/mock/chat/garbage');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.locator('.aiwt-test-error')).toContainText('无法解析');
});

test('配置不合法时不发起测试请求，而是先报校验问题', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('模型名').fill('mock-model');
  await page.getByLabel('请求地址').fill(CHAT_URL);

  await page.getByRole('button', { name: '测试连接' }).click();

  await expect(page.locator('.aiwt-issues')).toContainText('配置名称');
  await expect(page.locator('.aiwt-test-result')).toHaveCount(0);
  await expect(page.locator('.aiwt-test-error')).toHaveCount(0);
});

test('翻译提示词可编辑、保存、恢复默认，并在重新加载后保持', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('link', { name: /翻译提示词/ }).click();

  const promptField = page.getByLabel('提示词内容（内置默认）');
  await expect(promptField).toHaveValue(/翻译引擎/);
  await expect(page.getByRole('button', { name: '恢复默认' })).toBeDisabled();

  await promptField.fill('自定义提示词：只输出 {"translations":[{"id","text"}]}。');
  await page.getByRole('button', { name: '保存提示词' }).click();
  await expect(page.locator('.aiwt-status')).toContainText('翻译提示词已保存');

  await page.reload();
  await expect(page.getByLabel('提示词内容（自定义）')).toHaveValue(/自定义提示词/);

  await page.getByRole('button', { name: '恢复默认' }).click();
  await expect(page.locator('.aiwt-status')).toContainText('已恢复内置默认');
  await expect(page.getByLabel('提示词内容（内置默认）')).toHaveValue(/翻译引擎/);

  await page.reload();
  await expect(page.getByLabel('提示词内容（内置默认）')).toHaveValue(/翻译引擎/);
});

test('自定义提示词实际发送给翻译服务', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('link', { name: /翻译提示词/ }).click();
  await page.getByLabel('提示词内容（内置默认）').fill('自定义提示词：只输出 {"translations":[{"id","text"}]}。');
  await page.getByRole('button', { name: '保存提示词' }).click();
  await expect(page.locator('.aiwt-status')).toContainText('翻译提示词已保存');

  await page.getByRole('link', { name: /翻译服务/ }).click();
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill('本地模拟服务');
  await page.getByLabel('模型名').fill('mock-model');
  await page.getByLabel('请求地址').fill(CHAT_URL);
  await page.getByRole('button', { name: '测试连接' }).click();

  await expect(page.locator('.aiwt-test-result')).toContainText('模拟译文');
});
