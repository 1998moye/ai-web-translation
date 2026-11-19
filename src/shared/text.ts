/** 折叠空白并去除首尾空白，用于翻译单元原文规范化。 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 统计英文字词数量，用于判断界面文本是否足够短。 */
export function countWords(text: string): number {
  const matches = normalizeText(text).match(/[A-Za-z][A-Za-z'’-]*/g);
  return matches?.length ?? 0;
}

/**
 * FNV-1a 32 位指纹：用于判断翻译单元的原文是否发生变化。
 * 只比较当前原文与记录原文，不参与缓存键。
 */
export function fingerprintText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16)}:${text.length}`;
}
