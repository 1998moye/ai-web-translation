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

/**
 * 译文块始终用相对字号，不照抄原文的绝对像素：原文若是大号标题，照抄会撑爆版面；
 * flex 容器里还需要占满整行，否则中文会在被挤窄的列里逐字竖排。
 */
const BODY_BLOCK_STYLE = [
  'display: block',
  'margin: 0.35em 0 0.15em',
  'padding: 0',
  'border: 0',
  'background: transparent',
  'white-space: normal',
  'font-size: 0.9em',
  'line-height: 1.5',
  'width: 100%',
  'flex-basis: 100%',
].join(';');

/** 表格里再插入一份同字号译文会把行高撑开、列宽挤窄，因此更小并收紧行距。 */
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
  'font-weight',
  'font-style',
  'color',
  'text-align',
  'text-transform',
] as const;

/**
 * 把译文块放到原文旁边，保持原文与页面事件不变。
 *
 * 表格容器里不能出现额外兄弟节点，flex/grid 容器里新块会被挤成独立项目
 * （中文会因此逐字竖排），这两种情况都放进元素内部，沿用原文的列宽。
 */
function placeBlock(doc: Document, source: Element, block: HTMLElement): boolean {
  const parent = source.parentElement;
  if (!parent) return false;

  if (TABLE_CONTAINER_TAGS.has(parent.tagName.toUpperCase()) || isFlexOrGrid(doc, parent)) {
    source.append(block);
    return true;
  }

  source.insertAdjacentElement('afterend', block);
  return true;
}

function isFlexOrGrid(doc: Document, element: Element): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  try {
    const display = view.getComputedStyle(element).getPropertyValue('display');
    return display.includes('flex') || display.includes('grid');
  } catch {
    return false;
  }
}

/**
 * 译文块的样式：字号与行距用相对值，其余排版属性（尤其是颜色）沿用原文。
 * 只取文字颜色，不取背景与边框，避免译文块盖出多余色块。
 */
/**
 * 找出真正承载文字的元素。
 *
 * 提交信息这类单元格把颜色加在内层 span 上，而翻译单元是外层的单元格；
 * 只看外层就会拿到默认的黑色，译文与原文颜色对不上。
 */
function textHostOf(source: Element): Element {
  const host = (element: Element): Element => {
    const children = Array.from(element.children).filter((child) => !isSkippedElement(child));
    const hasOwnText = Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? '').trim(),
    );
    if (hasOwnText || children.length !== 1) return element;
    return host(children[0]!);
  };

  try {
    return host(source);
  } catch {
    return source;
  }
}

function styleFor(doc: Document, source: Element, inTable: boolean): string {
  const base = inTable ? TABLE_BLOCK_STYLE : BODY_BLOCK_STYLE;

  const view = doc.defaultView;
  if (!view) return base;

  const host = textHostOf(source);
  let style = base;
  try {
    const computed = view.getComputedStyle(host);
    for (const property of INHERITED_TYPOGRAPHY) {
      const value = computed.getPropertyValue(property);
      if (value) style += `;${property}: ${value}`;
    }
  } catch {
    return base;
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

  if (!placeBlock(doc, source, block)) return null;

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

const FAILURE_RETRY_STYLE = [
  'background: transparent',
  'border: 0',
  'padding: 0',
  'margin: 0 0 0 0.3em',
  'font: inherit',
  'color: #b45309',
  'text-decoration: underline',
  'cursor: pointer',
].join(';');

/** 失败标记：保留英文原文，并允许在这一段的位置直接重试。 */
export function renderFailureMarker(
  doc: Document,
  source: Element,
  unitId: TranslationUnitId,
  onRetry: () => void = () => {},
): RenderedTranslation | null {
  const block = doc.createElement('div');
  block.setAttribute(OWN_NODE_ATTRIBUTE, 'failure');
  block.setAttribute('data-aiwt-unit', unitId);
  block.setAttribute('style', FAILURE_BLOCK_STYLE);

  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.textContent = '重试';
  retry.setAttribute('style', FAILURE_RETRY_STYLE);
  retry.addEventListener('click', (event) => {
    // 失败提示常出现在链接或可点击的单元格里，别让页面自己的点击行为跟着触发。
    event.preventDefault();
    event.stopPropagation();
    onRetry();
  });

  block.append(doc.createTextNode('本段译文获取失败，'), retry);

  if (!placeBlock(doc, source, block)) return null;

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
