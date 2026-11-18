import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const stripInlineMarkers = (text) => text.replace(/⟦\/?[ow]\d+⟧/g, ' ').replace(/\s+/g, ' ').trim();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotsDir = path.join(root, 'store', 'assets', 'screenshots');
const demoPath = path.join(root, 'store', 'demo.html');
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const port = 4322;
const profileId = 'profile_store_demo';

await mkdir(screenshotsDir, { recursive: true });

const translations = new Map(
  Object.entries({
    'Field Notes': 'Field Notes',
    Guides: '指南',
    Notes: '笔记',
    About: '关于',
    Search: '搜索',
    'Practical guide · 8 min read': '实用指南 · 8 分钟阅读',
    'Practical guide · min read': '实用指南 · 8 分钟阅读',
    'A calmer way to read the English web': '更从容地阅读英文互联网',
    'Browser translation should feel like a reading aid — not another subscription to manage.':
      '浏览器翻译应该像一件阅读工具，而不是又一份需要打理的订阅。',
    'English in. Chinese out.': '英文输入，中文输出。',
    'Most translation tools ask you to hand over every page you read. This extension takes a different approach: you bring the AI service you already use, and the page stays yours.':
      '大多数翻译工具要求你交出读过的每一个页面。这个扩展换了一种方式：使用你已有的 AI 服务，页面内容仍然属于你。',
    'Most translation tools ask you to hand over every page you read.':
      '大多数翻译工具要求你交出读过的每一个页面。',
    'This extension takes a different approach:': '这个扩展换了一种方式：',
    'you bring the AI service you already use, and the page stays yours.':
      '使用你已有的 AI 服务，页面内容仍然属于你。',
    'This extension only translates English pages into Chinese. It does not translate Chinese into English, and it does not pretend to support every language pair.':
      '本扩展只把英文网页翻译成中文。它不做中文到英文，也不会假装支持所有语言。',
    'One direction, done well.': '只做一个方向，并把它做好。',
    'Bring your own AI': '自带 AI 服务',
    'Add a Chat Completions compatible endpoint, model, and API key in settings. No built-in model, no shared key, no subscription from us.':
      '在设置页填写兼容 Chat Completions 的地址、模型和 API Key。没有内置模型，没有共享密钥，也没有我们提供的订阅。',
    'Choose whole-page bilingual translation when you want to read carefully, or select a sentence when you only need a quick answer.':
      '想仔细阅读时，选择整页双语翻译；只需要快速理解时，选中一句话即可。',
    'What stays local': '哪些数据留在本机',
    'Settings, API keys, and cached translations stay in your browser. Only the text you choose to translate is sent to the service you configured.':
      '设置、API Key 和译文缓存保存在浏览器本机。只有你选择翻译的文本会发送到你配置的服务。',
    'In this guide': '本指南',
    'Why bring your own AI': '为什么自带 AI',
    'English to Chinese': '英文到中文',
    Privacy: '隐私',
    'No built-in model': '不内置模型',
    'Use your own endpoint and key.': '使用你自己的地址与密钥。',
  }),
);

function translate(text) {
  const plain = stripInlineMarkers(text);
  return translations.get(plain) ?? `中文：${plain}`;
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
  });
}

function readUnits(body) {
  const message = Array.isArray(body?.messages) ? body.messages.find((item) => item?.role === 'user') : undefined;
  if (typeof message?.content !== 'string') return [];
  try {
    const payload = JSON.parse(message.content);
    return Array.isArray(payload?.units)
      ? payload.units.filter((unit) => typeof unit?.id === 'string' && typeof unit?.text === 'string')
      : [];
  } catch {
    return [];
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
    });
    response.end();
    return;
  }

  if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
    const body = await readBody(request);
    const units = readUnits(body);
    const results = units.map((unit) => {
      const translated = translate(unit.text);
      if (translated.startsWith('中文：')) console.warn('Unmapped demo text:', unit.text);
      return { id: unit.id, text: translated };
    });
    response.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    response.end(
      JSON.stringify({
        model: body?.model ?? 'demo-model',
        choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations: results }) } }],
      }),
    );
    return;
  }

  if (url.pathname === '/demo.html' || url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await readFile(demoPath));
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('not found');
});

await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;

  const demoProfile = {
    id: profileId,
    name: '我的 AI 服务',
    requestFormat: 'chat-completions',
    url: `http://127.0.0.1:${port}/v1/chat/completions`,
    apiKey: '',
    model: 'my-translation-model',
    headers: {},
    extraParams: {},
    runtime: { concurrency: 2, timeoutMs: 30_000, retryCount: 0 },
  };

  await worker.evaluate(
    async ({ key, state }) => {
      await chrome.storage.local.set({ [key]: state });
    },
    {
      key: 'aiwt.translationProfiles',
      state: { profiles: [demoProfile], defaultProfileId: profileId },
    },
  );

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/demo.html`, { waitUntil: 'networkidle' });
  await page.locator('.aiwt-fab-main').waitFor({ state: 'visible' });
  await page.locator('.aiwt-fab-main').click();
  await page.locator('[data-aiwt="body-translation"]').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(1800);
  await page.mouse.move(12, 12);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(screenshotsDir, '01-page-translation.png') });

  // 划词翻译：选中正文段落，点击选区图标，等待中文气泡。
  const paragraph = page.locator('article .lead');
  await paragraph.click({ clickCount: 3 });
  const selectionIcon = page.locator('.aiwt-selection-icon');
  await selectionIcon.waitFor({ state: 'visible' });
  await selectionIcon.click();
  await page.locator('.aiwt-selection-bubble [data-aiwt-unit-status="done"]').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotsDir, '02-selection-translation.png') });

  // 设置页：换成一个面向真实商店用户的示例配置，避免截图出现本地 mock 地址。
  await worker.evaluate(
    async ({ key, state }) => {
      await chrome.storage.local.set({ [key]: state });
    },
    {
      key: 'aiwt.translationProfiles',
      state: {
        profiles: [
          {
            ...demoProfile,
            id: 'profile_store_example',
            name: '我的 AI 服务',
            url: 'https://api.example.com/v1/chat/completions',
            model: 'my-translation-model',
            apiKey: 'sk-demo-not-a-real-key-1234',
          },
        ],
        defaultProfileId: 'profile_store_example',
      },
    },
  );

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#models`, { waitUntil: 'networkidle' });
  await options.locator('.aiwt-app-notice').waitFor({ state: 'visible' });
  await options.waitForTimeout(800);
  await options.screenshot({ path: path.join(screenshotsDir, '03-your-own-ai.png') });

  console.log(`Store screenshots written to ${screenshotsDir}`);
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
