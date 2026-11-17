import { expect } from '@playwright/test';
import { resetExtensionStorage, test } from './helpers/extension';

const API_KEY = 'sk-e2e-secret-key-9876';

test.beforeEach(async ({ serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
});

test('可以新建、编辑默认、删除翻译服务配置，重新加载后保持一致且密钥脱敏', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('tab', { name: '翻译服务配置' })).toHaveAttribute('aria-selected', 'true');

  // 新建配置：额外请求参数默认显式关闭思考。
  await page.getByRole('button', { name: '新建配置' }).click();
  await expect(page.getByLabel('额外请求参数（JSON 对象）')).toHaveValue(/reasoning_effort/);
  await expect(page.getByLabel('并发数')).toHaveValue('3');
  await expect(page.getByLabel('请求超时（秒）')).toHaveValue('60');
  await expect(page.getByLabel('自动重试次数')).toHaveValue('2');

  await page.getByLabel('配置名称').fill('主力服务');
  await page.getByLabel('请求地址').fill('https://api.example.com/v1/chat/completions');
  await page.getByLabel('模型名').fill('gpt-4o-mini');
  await page.getByLabel('API Key', { exact: true }).fill(API_KEY);
  await page.getByRole('button', { name: '保存', exact: true }).click();

  const items = page.locator('.aiwt-profile-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('主力服务');
  await expect(items.first()).toContainText('默认');
  await expect(items.first()).toContainText('gpt-4o-mini');
  await expect(items.first()).toContainText('api.example.com');
  await expect(items.first()).toContainText('••••••••9876');
  expect(await page.content()).not.toContain(API_KEY);

  // 重新加载设置页后配置与默认选择仍然存在。
  await page.reload();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('主力服务');

  // 第二份配置可以设为默认。
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill('备用服务');
  await page.getByLabel('请求地址').fill('http://127.0.0.1:11434/v1/chat/completions');
  await page.getByLabel('模型名').fill('qwen-plus');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await expect(items).toHaveCount(2);
  const second = items.filter({ hasText: '备用服务' });
  await second.getByRole('button', { name: '设为默认' }).click();
  await expect(second.locator('.aiwt-badge')).toHaveText('默认');
  await expect(items.filter({ hasText: '主力服务' }).locator('.aiwt-badge')).toHaveCount(0);

  await page.reload();
  await expect(items.filter({ hasText: '备用服务' }).locator('.aiwt-badge')).toHaveText('默认');

  // 删除默认配置后，默认选择回落到仍在的配置。
  await items.filter({ hasText: '备用服务' }).getByRole('button', { name: '删除' }).click();
  await items.filter({ hasText: '备用服务' }).getByRole('button', { name: '确认删除' }).click();

  await expect(items).toHaveCount(1);
  await expect(items.filter({ hasText: '主力服务' }).locator('.aiwt-badge')).toHaveText('默认');

  await page.reload();
  await expect(items).toHaveCount(1);
});

test('保存前校验必填项、地址协议与额外参数，并保留高级设置', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();

  await page.getByRole('button', { name: '保存', exact: true }).click();
  const issues = page.locator('.aiwt-issues');
  await expect(issues).toContainText('配置名称');
  await expect(issues).toContainText('请求地址');
  await expect(issues).toContainText('模型名');

  await page.getByLabel('配置名称').fill('本地服务');
  await page.getByLabel('模型名').fill('qwen-plus');
  await page.getByLabel('请求地址').fill('http://api.example.com/v1/chat/completions');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.aiwt-issues')).toContainText('HTTPS');

  await page.getByLabel('请求地址').fill('http://127.0.0.1:11434/v1/chat/completions');
  await page.getByLabel('自定义请求头').fill('X-Tenant: team-a');
  await page.getByLabel('额外请求参数（JSON 对象）').fill(
    '{"reasoning_effort":"none","temperature":0.2}',
  );
  await page.getByLabel('并发数').fill('5');
  await page.getByLabel('请求超时（秒）').fill('90');
  await page.getByLabel('自动重试次数').fill('1');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  const item = page.locator('.aiwt-profile-item').first();
  await expect(item).toContainText('本地服务');
  await expect(item).toContainText('未设置 API Key');

  await page.reload();
  await page.locator('.aiwt-profile-item').first().getByRole('button', { name: '编辑' }).click();
  await expect(page.getByLabel('自定义请求头')).toHaveValue('X-Tenant: team-a');
  await expect(page.getByLabel('额外请求参数（JSON 对象）')).toHaveValue(/temperature/);
  await expect(page.getByLabel('并发数')).toHaveValue('5');
  await expect(page.getByLabel('请求超时（秒）')).toHaveValue('90');
  await expect(page.getByLabel('自动重试次数')).toHaveValue('1');

  // API Key 与 Authorization 请求头冲突时拒绝保存。
  await page.getByLabel('API Key', { exact: true }).fill(API_KEY);
  await page.getByLabel('自定义请求头').fill('Authorization: Bearer token-1234');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const conflict = page.locator('.aiwt-issues');
  await expect(conflict).toContainText('Authorization');
  expect(await conflict.textContent()).not.toContain(API_KEY);
  expect(await conflict.textContent()).not.toContain('token-1234');

  // 浏览器禁止设置的请求头有明确提示。
  await page.getByLabel('API Key', { exact: true }).fill('');
  await page.getByLabel('自定义请求头').fill('Host: example.com');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.aiwt-issues')).toContainText('Host');
});
