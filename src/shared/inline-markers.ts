/**
 * 翻译单元行内格式的占位标记。
 *
 * 正文中的行内代码等不可翻译内容不进入翻译请求，翻译服务只会看到 `⟦o1⟧`；
 * 链接、强调以 `⟦w1⟧…⟦/w1⟧` 包裹内部文本，由渲染层还原为安全的 DOM 节点。
 */
export const INLINE_MARKER_SOURCE = String.raw`⟦(\/?)([ow])(\d+)⟧`;

export const INLINE_MARKER_PATTERN = new RegExp(INLINE_MARKER_SOURCE, 'g');

/** 去掉标记并折叠空白，得到用户可读的纯文本。 */
export function stripInlineMarkers(text: string): string {
  return text.replace(new RegExp(INLINE_MARKER_SOURCE, 'g'), ' ').replace(/\s+/g, ' ').trim();
}
