import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(root, 'fixtures');
const port = Number(process.env.PORT ?? 4321);

// 请求计数：让端到端测试能观察「是否真的产生了翻译请求」。
const chatStats = new Map();
/** 限流场景只拒绝第一次请求，之后正常返回。 */
let rateLimitOnceHits = 0;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }

  // 可控的 Chat Completions 替身：让端到端测试验证完整链路的用户可见表现。
  if (url.pathname.startsWith('/mock/chat/')) {
    await handleMockChat(url.pathname.slice('/mock/chat/'.length), request, response);
    return;
  }

  if (url.pathname === '/mock/stats') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(Object.fromEntries(chatStats)));
    return;
  }

  if (url.pathname === '/mock/reset') {
    chatStats.clear();
    rateLimitOnceHits = 0;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('reset');
    return;
  }

  const name = url.pathname === '/' ? 'article.html' : url.pathname.slice(1);
  if (!/^[\w.-]+\.html$/.test(name)) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
    return;
  }

  try {
    const body = await readFile(path.join(fixturesDir, name));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
});

// 不指定 host：同时接受 127.0.0.1 与 localhost，用于验证完整域名隔离。
server.listen(port, () => {
  console.log(`fixtures server listening on http://127.0.0.1:${port}`);
});

async function handleMockChat(scenario, request, response) {
  chatStats.set(scenario, (chatStats.get(scenario) ?? 0) + 1);
  const body = await readJsonBody(request);

  const reject = (status, headers = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...headers });
    response.end(JSON.stringify({ error: { message: `mock ${scenario}` } }));
  };

  if (scenario === 'unauthorized') return reject(401);
  if (scenario === 'forbidden') return reject(403);
  if (scenario === 'bad-request') return reject(400);
  if (scenario === 'rate-limited') return reject(429, { 'retry-after': '1' });
  if (scenario === 'ratelimit-once') {
    rateLimitOnceHits += 1;
    if (rateLimitOnceHits === 1) return reject(429, { 'retry-after': '0.2' });
    // 第一次限流之后正常返回，用于验证自动重试。
  }
  if (scenario === 'server-error') return reject(503);

  if (scenario === 'garbage') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '好的，译文如下。' } }] }));
    return;
  }

  // 慢响应：用于验证「测试中」状态与防重复提交。
  if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200));

  // 默认场景：按请求单元逐个返回约定结构的译文。
  const units = readUnits(body);
  const prefix = scenario === 'alt' ? '备选译文：' : '模拟译文：';
  // partial 场景故意漏掉第一个单元的译文，用于验证部分失败。
  const translated = scenario === 'partial' ? units.slice(1) : units;
  const payload = {
    translations: translated.map((unit) => ({ id: unit.id, text: `${prefix}${unit.text}` })),
  };

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      model: body?.model ?? 'mock-model',
      choices: [{ message: { role: 'assistant', content: JSON.stringify(payload) } }],
    }),
  );
}

function readUnits(body) {
  const userMessage = Array.isArray(body?.messages) ? body.messages.find((m) => m?.role === 'user') : undefined;
  if (typeof userMessage?.content !== 'string') return [];
  try {
    const payload = JSON.parse(userMessage.content);
    return Array.isArray(payload?.units)
      ? payload.units.filter((unit) => typeof unit?.id === 'string' && typeof unit?.text === 'string')
      : [];
  } catch {
    return [];
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}
