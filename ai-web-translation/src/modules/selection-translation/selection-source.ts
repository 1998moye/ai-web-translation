import type { SelectionSource } from './selection-translation-controller';

/**
 * 浏览器选区读取实现。
 *
 * 只读取用户主动选中的文本和选区位置，不扫描页面其它内容。
 */
export function createDomSelectionSource(doc: Document = document): SelectionSource {
  return {
    read() {
      const selection = doc.defaultView?.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

      const text = selection.toString();
      if (!text.trim()) return null;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return null;

      return {
        text,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    },
  };
}
