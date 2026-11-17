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
