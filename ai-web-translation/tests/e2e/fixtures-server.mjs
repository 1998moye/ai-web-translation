import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(root, 'fixtures');
const port = Number(process.env.PORT ?? 4321);

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
  const body = await readJsonBody(request);

  const reject = (status, headers = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...headers });
    response.end(JSON.stringify({ error: { message: `mock ${scenario}` } }));
  };

  if (scenario === 'unauthorized') return reject(401);
  if (scenario === 'forbidden') return reject(403);
  if (scenario === 'bad-request') return reject(400);
  if (scenario === 'rate-limited') return reject(429, { 'retry-after': '1' });
  if (scenario === 'server-error') return reject(503);

  if (scenario === 'garbage') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '好的，译文如下。' } }] }));
    return;
  }

  // 慢响应：用于验证「测试中」状态与防重复提交。
  if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200));

  // 默认场景：按请求单元逐个返回约定结构的译文。
  const prefix = scenario === 'alt' ? '备选译文：' : '模拟译文：';
  const units = readUnits(body);
  const payload = {
    translations: units.map((unit) => ({ id: unit.id, text: `${prefix}${unit.text}` })),
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
