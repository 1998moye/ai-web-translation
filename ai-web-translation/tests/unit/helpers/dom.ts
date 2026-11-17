/** 设置固定 DOM 样本；每个测试都从干净的 document 开始。 */
export function setPage(html: string, options: { title?: string } = {}): void {
  document.head.innerHTML = `<title>${options.title ?? 'Test page'}</title>`;
  document.body.innerHTML = html;
}

/** 轮询外部可观察状态，避免在测试里断言私有实现细节。 */
export async function waitFor(
  predicate: () => boolean,
  message = '等待条件超时',
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function textOfAll(selector: string): string[] {
  return [...document.querySelectorAll(selector)].map((element) => element.textContent?.trim() ?? '');
}
