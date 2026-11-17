import {
  createInlineNodes,
  formatPlainText,
  OWN_NODE_ATTRIBUTE,
  type InlineFormat,
} from '../inline-format/inline-format';
import type { TranslationUnitId } from '@/shared/ids';

export interface RenderedTranslation {
  /** 插件插入或替换到页面中的节点，用于判断译文是否仍然有效。 */
  readonly nodes: readonly Node[];
  restore(): void;
}

const BODY_BLOCK_STYLE = [
  'display: block',
  'margin: 0.35em 0 0.15em',
  'padding: 0',
  'border: 0',
  'background: transparent',
  'color: inherit',
  'font-size: 0.94em',
  'line-height: 1.55',
  'white-space: normal',
  'text-align: inherit',
].join(';');

const FAILURE_BLOCK_STYLE = [
  'display: block',
  'margin: 0.25em 0 0.15em',
  'padding: 0',
  'border: 0',
  'font-size: 0.85em',
  'line-height: 1.4',
  'color: #b45309',
].join(';');

function insertBlockAfter(source: Element, block: HTMLElement): boolean {
  if (!source.parentElement) return false;
  source.insertAdjacentElement('afterend', block);
  return true;
}

/** 正文译文：在原文段落之后插入独立块，原文与网页事件保持不变。 */
export function renderBodyTranslation(
  doc: Document,
  source: Element,
  translatedText: string,
  formats: readonly InlineFormat[],
  unitId: TranslationUnitId,
): RenderedTranslation | null {
  const nodes = createInlineNodes(doc, translatedText, formats);
  if (nodes.length === 0) return null;

  const block = doc.createElement('div');
  block.setAttribute(OWN_NODE_ATTRIBUTE, 'body-translation');
  block.setAttribute('data-aiwt-unit', unitId);
  block.setAttribute('lang', 'zh-CN');
  block.setAttribute('style', BODY_BLOCK_STYLE);
  block.append(...nodes);

  if (!insertBlockAfter(source, block)) return null;

  return {
    nodes: [block],
    restore(): void {
      block.remove();
    },
  };
}

/**
 * 界面文本译文优先：用译文节点替换原文本，原节点保留在内存中用于恢复，
 * 并通过 title 提供悬停查看英文原文。
 */
export function renderInterfaceTranslation(
  doc: Document,
  element: HTMLElement,
  translatedText: string,
  formats: readonly InlineFormat[],
  originalText: string,
): RenderedTranslation | null {
  const nodes = createInlineNodes(doc, translatedText, formats);
  if (nodes.length === 0) return null;

  const originalNodes = Array.from(element.childNodes);
  const hadTitle = element.hasAttribute('title');
  const originalTitle = element.getAttribute('title');

  element.replaceChildren(...nodes);
  element.setAttribute('data-aiwt-translated', 'true');
  element.setAttribute('title', formatPlainText(originalText));

  return {
    nodes,
    restore(): void {
      if (!isRendering(element, nodes)) return;
      element.replaceChildren(...originalNodes);
      element.removeAttribute('data-aiwt-translated');
      if (hadTitle && originalTitle !== null) element.setAttribute('title', originalTitle);
      else element.removeAttribute('title');
    },
  };
}

/** 失败标记：保留英文原文，并让用户看到这一段的失败状态。 */
export function renderFailureMarker(
  doc: Document,
  source: Element,
  unitId: TranslationUnitId,
): RenderedTranslation | null {
  const block = doc.createElement('div');
  block.setAttribute(OWN_NODE_ATTRIBUTE, 'failure');
  block.setAttribute('data-aiwt-unit', unitId);
  block.setAttribute('style', FAILURE_BLOCK_STYLE);
  block.textContent = '本段译文获取失败，可点击悬浮翻译按钮重试。';

  if (!insertBlockAfter(source, block)) return null;

  return {
    nodes: [block],
    restore(): void {
      block.remove();
    },
  };
}

/** 元素当前是否仍然完整显示我们插入的译文节点。 */
export function isRendering(element: Element, nodes: readonly Node[]): boolean {
  if (nodes.length === 0) return false;
  if (element.childNodes.length !== nodes.length) return false;
  return nodes.every((node, index) => element.childNodes[index] === node);
}
