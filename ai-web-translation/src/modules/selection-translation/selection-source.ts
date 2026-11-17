import type { SelectionReading, SelectionSource } from './selection-translation-controller';

/** 代码内容：代码块、行内代码、命令示例等默认不属于翻译范围。 */
const CODE_SELECTOR = 'pre, code, kbd, samp, var, tt';

/**
 * 浏览器选区读取实现。
 *
 * 只读取用户主动选中的文本和选区位置；选中区域里的代码内容会从待翻译文本中
 * 排除，但原始文本保留给气泡展示。
 */
export function createDomSelectionSource(doc: Document = document): SelectionSource {
  return {
    read() {
      const selection = doc.defaultView?.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

      const rawText = selection.toString();
      if (!rawText.trim()) return null;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return null;

      return {
        ...readTranslatableText(range, rawText),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    },
  };
}

function readTranslatableText(
  range: Range,
  rawText: string,
): Pick<SelectionReading, 'text' | 'rawText' | 'codeExcluded'> {
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;

  // 整个选区落在代码元素内部：没有可翻译文本，只说明原因。
  if (element?.closest(CODE_SELECTOR)) {
    return { text: '', rawText, codeExcluded: true };
  }

  const fragment = range.cloneContents();
  const codeElements = fragment.querySelectorAll(CODE_SELECTOR);
  for (const code of codeElements) code.remove();

  return {
    text: fragment.textContent ?? '',
    rawText,
    codeExcluded: codeElements.length > 0,
  };
}
