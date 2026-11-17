import {
  createInlineNodes,
  formatPlainText,
  isSkippedElement,
  OWN_NODE_ATTRIBUTE,
  type InlineFormat,
} from '../inline-format/inline-format';
import type { TranslationUnitId } from '@/shared/ids';

export interface RenderedTranslation {
  /** 插件插入或替换到页面中的节点，用于判断译文是否仍然有效。 */
  readonly nodes: readonly Node[];
  /** 译文是否仍然完整地显示在页面上。 */
  isIntact(): boolean;
  restore(): void;
}

const BODY_BLOCK_STYLE = [
  'display: block',
  'margin: 0.35em 0 0.15em',
  'padding: 0',
  'border: 0',
  'background: transparent',
  'white-space: normal',
].join(';');

/** 表格里再插入一份同字号译文会把行高撑开、列宽挤窄，因此缩小并收紧行距。 */
const TABLE_BLOCK_STYLE = [
  BODY_BLOCK_STYLE,
  'font-size: 0.82em',
  'line-height: 1.45',
  'margin: 0.2em 0 0',
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

/** 这些父元素里不能出现额外的块级兄弟节点：浏览器会把整张表的结构和列宽重排。 */
const TABLE_CONTAINER_TAGS = new Set(['TR', 'TBODY', 'THEAD', 'TFOOT', 'TABLE', 'COLGROUP']);

const TABLE_CELL_SELECTOR = 'td, th, caption';

/**
 * 译文沿用原文的排版：标题仍然像标题、强调仍然是强调。
 * 只复制排版相关属性，不复制定位与外框，避免译文块脱离原有版式。
 */
const INHERITED_TYPOGRAPHY = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'line-height',
  'color',
  'text-align',
  'text-transform',
] as const;

/**
 * 把译文块放到原文旁边：
 * 表格单元格与标题放在元素内部，其余元素放在元素之后，保持原文与页面事件不变。
 */
function placeBlock(source: Element, block: HTMLElement): boolean {
  const parent = source.parentElement;
  if (!parent) return false;
  if (TABLE_CONTAINER_TAGS.has(parent.tagName.toUpperCase())) {
    source.append(block);
    return true;
  }
  source.insertAdjacentElement('afterend', block);
  return true;
}

function styleFor(doc: Document, source: Element, inTable: boolean): string {
  if (inTable) return TABLE_BLOCK_STYLE;

  const view = doc.defaultView;
  if (!view) return BODY_BLOCK_STYLE;

  let style = BODY_BLOCK_STYLE;
  try {
    const computed = view.getComputedStyle(source);
    for (const property of INHERITED_TYPOGRAPHY) {
      const value = computed.getPropertyValue(property);
      if (value) style += `;${property}: ${value}`;
    }
  } catch {
    return BODY_BLOCK_STYLE;
  }
  return style;
}

/** 正文译文：在原文旁边插入独立块，原文与网页事件保持不变。 */
export function renderBodyTranslation(
  doc: Document,
  source: Element,
  translatedText: string,
  formats: readonly InlineFormat[],
  unitId: TranslationUnitId,
): RenderedTranslation | null {
  const nodes = createInlineNodes(doc, translatedText, formats);
  if (nodes.length === 0) return null;

  const inTable = source.closest(TABLE_CELL_SELECTOR) !== null;
  const block = doc.createElement('div');
  block.setAttribute(OWN_NODE_ATTRIBUTE, 'body-translation');
  block.setAttribute('data-aiwt-unit', unitId);
  block.setAttribute('lang', 'zh-CN');
  block.setAttribute('style', styleFor(doc, source, inTable));
  block.append(...nodes);

  if (!placeBlock(source, block)) return null;

  return {
    nodes: [block],
    isIntact: () => block.isConnected,
    restore(): void {
      block.remove();
    },
  };
}

/**
 * 界面文本译文优先，并通过 title 提供悬停查看英文原文。
 *
 * 译文里没有行内格式时只改写元素内已有的文本节点：整块替换子节点会丢掉包住文字的
 * span/label，class 一消失，字号、颜色和宽度都会跟着塌掉，文字甚至会被挤成竖排。
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

  const hadTitle = element.hasAttribute('title');
  const originalTitle = element.getAttribute('title');
  const title = formatPlainText(originalText, formats);

  const textNodes = collectTextNodes(element);
  const plainText = nodes.every((node) => node.nodeType === Node.TEXT_NODE) ? nodes : null;
  if (plainText && textNodes.length > 0) {
    const value = plainText.map((node) => node.textContent ?? '').join('');
    const previous = textNodes.map((node) => node.nodeValue);
    textNodes[0]!.nodeValue = value;
    for (const node of textNodes.slice(1)) node.nodeValue = '';

    const intact = (): boolean =>
      textNodes.every((node, index) => node.isConnected && node.nodeValue === (index === 0 ? value : ''));

    element.setAttribute('data-aiwt-translated', 'true');
    element.setAttribute('title', title);

    return {
      nodes: textNodes,
      isIntact: intact,
      restore(): void {
        if (!intact()) return;
        textNodes.forEach((node, index) => {
          node.nodeValue = previous[index] ?? '';
        });
        element.removeAttribute('data-aiwt-translated');
        restoreTitle(element, hadTitle, originalTitle);
      },
    };
  }

  const originalNodes = Array.from(element.childNodes);
  // 输入框、图标等被扫描跳过的子元素不属于译文，替换文本时必须原位保留。
  const preserved = originalNodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.nodeType === Node.ELEMENT_NODE && isSkippedElement(node as Element));

  element.replaceChildren(...nodes);
  for (const { node, index } of preserved) {
    const reference = element.childNodes[Math.min(index, element.childNodes.length)] ?? null;
    element.insertBefore(node, reference);
  }

  const renderedNodes = Array.from(element.childNodes);
  element.setAttribute('data-aiwt-translated', 'true');
  element.setAttribute('title', title);

  return {
    nodes: renderedNodes,
    isIntact: () => isRendering(element, renderedNodes),
    restore(): void {
      if (!isRendering(element, renderedNodes)) return;
      element.replaceChildren(...originalNodes);
      element.removeAttribute('data-aiwt-translated');
      restoreTitle(element, hadTitle, originalTitle);
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

  if (!placeBlock(source, block)) return null;

  return {
    nodes: [block],
    isIntact: () => block.isConnected,
    restore(): void {
      block.remove();
    },
  };
}

/**
 * 译文与原文相同（例如文件名、标识符）：保留原文，不再插入一份重复内容。
 */
export function renderUnchanged(element: Element): RenderedTranslation {
  return {
    nodes: [],
    isIntact: () => element.isConnected,
    restore(): void {},
  };
}

/** 元素当前是否仍然完整显示我们插入的译文节点。 */
export function isRendering(element: Element, nodes: readonly Node[]): boolean {
  if (nodes.length === 0) return false;
  if (element.childNodes.length !== nodes.length) return false;
  return nodes.every((node, index) => element.childNodes[index] === node);
}

/** 收集元素自身文本节点，跳过图标、输入框等不属于译文的子树。 */
function collectTextNodes(element: Element): Text[] {
  const textNodes: Text[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.nodeValue ?? '').trim()) textNodes.push(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as Element;
    if (isSkippedElement(child)) return;
    for (const grandChild of Array.from(child.childNodes)) walk(grandChild);
  };

  for (const child of Array.from(element.childNodes)) walk(child);
  return textNodes;
}

function restoreTitle(element: Element, hadTitle: boolean, originalTitle: string | null): void {
  if (hadTitle && originalTitle !== null) element.setAttribute('title', originalTitle);
  else element.removeAttribute('title');
}
