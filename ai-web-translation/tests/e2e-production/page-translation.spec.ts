import { expect, type Page } from '@playwright/test';
import { openFabPanel, resetExtensionStorage, test } from '../e2e/helpers/extension';

/**
 * 整页翻译生产装配验收：真实 Translation Engine + 后台传输 + Translation Profile Catalog，
 * 翻译服务指向可控的 mock Chat Completions 端点。
 */

test.beforeEach(async ({ serviceWorker, request }) => {
  await resetExtensionStorage(serviceWorker);
  await request.post('/mock/reset');
});

interface ProfileOptions {
  scenario: string;
  name?: string;
  timeoutSeconds?: number;
  retryCount?: number;
}

async function saveProfile(page: Page, extensionId: string, options: ProfileOptions): Promise<void> {
  const name = options.name ?? `模拟服务 ${options.scenario}`;
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: '新建配置' }).click();
  await page.getByLabel('配置名称').fill(name);
  await page.getByLabel('模型名').fill('mock-model');
  await page.getByLabel('请求地址').fill(`http://127.0.0.1:4321/mock/chat/${options.scenario}`);
  if (options.timeoutSeconds !== undefined) {
    await page.getByLabel('请求超时（秒）').fill(String(options.timeoutSeconds));
  }
  if (options.retryCount !== undefined) {
    await page.getByLabel('自动重试次数').fill(String(options.retryCount));
  }
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.aiwt-profile-item').filter({ hasText: name })).toHaveCount(1);
}

async function chatRequests(request: import('@playwright/test').APIRequestContext, scenario: string): Promise<number> {
  const response = await request.get('/mock/stats');
  const stats = (await response.json()) as Record<string, number>;
  return stats[scenario] ?? 0;
}

const translations = (page: Page) => page.locator('[data-aiwt="body-translation"]');

test('整页翻译走生产 Engine，动态新增与原文变化沿用同一会话', async ({ page, extensionId }) => {
  await saveProfile(page, extensionId, { scenario: 'completions' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();
  await expect(translations(page)).toHaveCount(5);
  await expect(translations(page).first()).toContainText('模拟译文：');
  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'completed');

  // 动态新增段落自动翻译。
  await page.evaluate(() => {
    const paragraph = document.createElement('p');
    paragraph.id = 'added';
    paragraph.textContent = 'A fresh English paragraph added after the session started.';
    document.querySelector('main')?.append(paragraph);
  });
  await expect(translations(page)).toHaveCount(6);
  await expect(page.locator('#added + [data-aiwt="body-translation"]')).toContainText('A fresh English paragraph');

  // 原文变化：旧译文失效，按新原文重新翻译。
  await page.evaluate(() => {
    const paragraph = document.querySelector('#first');
    if (paragraph) paragraph.textContent = 'A changed English paragraph about foxes and translation.';
  });
  await expect(page.locator('#first + [data-aiwt="body-translation"]')).toContainText(
    'A changed English paragraph about foxes',
  );
  await expect(page.locator('#first + [data-aiwt="body-translation"]')).not.toContainText('quick brown fox');
  await expect(translations(page)).toHaveCount(6);
});

test('恢复原文后重新翻译命中译文缓存，不再请求翻译服务', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'completions' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();
  await expect(translations(page)).toHaveCount(5);
  const afterFirst = await chatRequests(request, 'completions');
  expect(afterFirst).toBeGreaterThan(0);

  await page.locator('.aiwt-fab-main').click();
  await expect(translations(page)).toHaveCount(0);

  await page.reload();
  await page.locator('.aiwt-fab-main').click();
  await expect(translations(page)).toHaveCount(5);
  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'completed');

  // 所有单元命中缓存，没有新的 HTTP 请求。
  expect(await chatRequests(request, 'completions')).toBe(afterFirst);
});

test('认证失败直接显示脱敏原因，且不自动重试', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'unauthorized' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();

  await expect(page.locator('.aiwt-fab-status')).toContainText('认证失败');
  await expect(page.locator('.aiwt-fab-main')).toHaveAttribute('aria-label', '恢复原文（部分段落翻译失败）');
  await expect(page.locator('[data-aiwt="failure"]').first()).toBeVisible();
  // 两个批次各一次，认证错误不重试。
  expect(await chatRequests(request, 'unauthorized')).toBe(2);
});

test('400 参数错误显示原因且不重试', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'bad-request' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();

  await expect(page.locator('.aiwt-fab-status')).toContainText('翻译请求被拒绝');
  expect(await chatRequests(request, 'bad-request')).toBe(2);
});

test('403 与 401 一样直接显示认证失败且不重试', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'forbidden' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();

  await expect(page.locator('.aiwt-fab-status')).toContainText('认证失败');
  expect(await chatRequests(request, 'forbidden')).toBe(2);
});

test('429 与 5xx 按配置自动重试并最终完成', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'ratelimit-once' });
  await page.goto('/article.html');
  await page.locator('.aiwt-fab-main').click();
  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'completed');
  expect(await chatRequests(request, 'ratelimit-once')).toBeGreaterThan(1);
});

test('5xx 一次性故障重试后成功', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'server-error-once' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();

  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'completed');
  // 首个批次失败一次后重试成功，另一个批次直接成功。
  expect(await chatRequests(request, 'server-error-once')).toBe(3);
});

test('超时按配置中止，不无限等待', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'timeout', timeoutSeconds: 1, retryCount: 2 });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();

  await expect(page.locator('.aiwt-fab-status')).toContainText('超时');
  // 超时不在自动重试范围，每个批次只请求一次。
  expect(await chatRequests(request, 'timeout')).toBe(2);
});

test('无效结构与未知单元 ID 不会猜测性渲染', async ({ page, extensionId }) => {
  await saveProfile(page, extensionId, { scenario: 'garbage' });
  await page.goto('/article.html');
  await page.locator('.aiwt-fab-main').click();

  await expect(page.locator('.aiwt-fab-status')).toContainText('无法解析');
  await expect(translations(page)).toHaveCount(0);

  await saveProfile(page, extensionId, { scenario: 'invalid-ids', name: '未知单元服务' });
  await page.goto('/article.html');
  await page.locator('.aiwt-fab-main').click();

  await expect(page.locator('.aiwt-fab-status')).toContainText('无法解析');
  await expect(translations(page)).toHaveCount(0);
});

test('部分失败只重试失败单元，成功后状态恢复完整', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'flaky-partial' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();
  await expect(page.locator('.aiwt-fab-status')).toContainText('段失败');
  await expect(translations(page)).toHaveCount(4);
  const beforeRetry = await chatRequests(request, 'flaky-partial');

  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '重试失败段落' }).click();

  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'completed');
  await expect(translations(page)).toHaveCount(5);
  expect(await chatRequests(request, 'flaky-partial')).toBe(beforeRetry + 1);
});

test('取消翻译后不再插入迟到译文', async ({ page, extensionId }) => {
  await saveProfile(page, extensionId, { scenario: 'slow' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();
  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'translating');

  // 翻译中展示角色写字的动画，不再用外圈光环。
  await expect(page.locator('.aiwt-fab-work')).toBeVisible();
  await expect(page.locator('.aiwt-fab-pencil')).toBeVisible();
  await expect(page.locator('.aiwt-fab-orbit')).toHaveCount(0);

  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '停止翻译' }).click();
  await expect(page.locator('.aiwt-fab')).toHaveAttribute('data-aiwt-phase', 'cancelled');
  await expect(page.locator('.aiwt-fab-status')).toContainText('已取消翻译');

  await page.waitForTimeout(1600);
  await expect(translations(page)).toHaveCount(0);
});

test('乱序返回时译文仍按原文段落顺序显示', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'out-of-order' });
  await page.goto('/article.html');

  await page.locator('.aiwt-fab-main').click();
  await expect(translations(page)).toHaveCount(5);

  await expect(page.locator('#first + [data-aiwt="body-translation"]')).toContainText('quick brown fox');
  await expect(page.locator('#last + [data-aiwt="body-translation"]')).toContainText('Another English paragraph');
  expect(await chatRequests(request, 'out-of-order')).toBeGreaterThan(1);
});

test('重新翻译使用最新默认配置', async ({ page, extensionId }) => {
  await saveProfile(page, extensionId, { scenario: 'completions', name: '主力服务' });
  await page.goto('/article.html');
  await page.locator('.aiwt-fab-main').click();
  await expect(translations(page).first()).toContainText('模拟译文：');

  // 在另一个设置页创建并切换默认配置，当前页面会话保持不动。
  const options = await page.context().newPage();
  await saveProfile(options, extensionId, { scenario: 'alt', name: '备选服务' });
  const alternate = options.locator('.aiwt-profile-item').filter({ hasText: '备选服务' });
  await alternate.getByRole('button', { name: '设为默认' }).click();
  await expect(alternate.locator('.aiwt-badge')).toHaveText('默认');
  await options.close();

  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '重新翻译' }).click();

  await expect(translations(page).first()).toContainText('备选译文：');
  await expect(translations(page).first()).not.toContainText('模拟译文：');
});

test('按网站自动翻译使用生产 Engine，恢复原文后同一次停留不再触发', async ({ page, extensionId, request }) => {
  await saveProfile(page, extensionId, { scenario: 'completions' });
  await page.goto('/article.html');

  await openFabPanel(page);
  await page.locator('.aiwt-fab-panel').getByRole('button', { name: '此网站自动翻译' }).click();
  await page.reload();

  await expect(translations(page)).toHaveCount(5);
  const afterAuto = await chatRequests(request, 'completions');
  expect(afterAuto).toBeGreaterThan(0);

  await page.locator('.aiwt-fab-main').click();
  await expect(translations(page)).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(translations(page)).toHaveCount(0);
});
