import { fingerprintText, normalizeText } from '@/shared/text';
import { StyleCache } from '../dom/style-cache';
import type { TranslationUnitKind } from '../translation-contract/types';
import {
  buildInlinePayload,
  expandOpaqueMarkers,
  isCodeElement,
  isHiddenElement,
  isSkippedElement,
  OWN_NODE_SELECTOR,
  type InlineFormat,
  type InlinePayload,
} from '../inline-format/inline-format';
import { isBodyTargetLayoutSafe, isChartRegion } from './layout-safety';

export interface TranslatableTarget {
  element: HTMLElement;
  kind: TranslationUnitKind;
  /** 提交给 Translation Engine 的原文，含行内格式占位标记。 */
  text: string;
  formats: InlineFormat[];
  fingerprint: string;
}

const BODY_SELECTOR = 'p, li, blockquote, dd, dt, figcaption, h1, h2, h3, h4, h5, h6, td, caption';

/** 这些区域属于导航、菜单或表单，正文单元不在这里建立，避免与界面文本重复。 */
const BODY_EXCLUDED_ANCESTOR =
  'nav, [role="navigation"], [role="menu"], [role="menubar"], [role="toolbar"], [role="search"], form';

const INTERFACE_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="switch"]',
  'label',
  'legend',
  'summary',
].join(', ');

const INTERFACE_MAX_WORDS = 20;
const DIV_MIN_TEXT_LENGTH = 25;

const BLOCKISH_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS', 'DIALOG', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR',
  'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

/** 行内包装元素内部几乎不会出现块级布局，不必递归整棵子树。 */
const INLINE_WRAPPER_TAGS = new Set([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'CODE', 'EM', 'I', 'LABEL', 'MARK', 'S', 'SMALL', 'SPAN', 'STRONG',
  'SUB', 'SUP', 'TIME', 'U', 'WBR',
]);

const EDITABLE_SELECTOR =
  '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], textarea, select, option';

interface Candidate {
  element: HTMLElement;
  payload: InlinePayload;
}

function isOwnNode(element: Element): boolean {
  return element.closest(OWN_NODE_SELECTOR) !== null;
}

function isInsideEditableRegion(element: Element): boolean {
  return element.closest(EDITABLE_SELECTOR) !== null;
}

function isInsideCode(element: Element): boolean {
  return isCodeElement(element) || element.closest('code, pre, kbd, samp, var, tt') !== null;
}

function isInsideSkippedContainer(element: Element): boolean {
  return element.closest('script, style, noscript, template, svg, canvas, iframe, object, embed') !== null;
}

function hasBlockishChild(element: Element, visibility: StyleCache): boolean {
  for (const child of Array.from(element.children)) {
    if (BLOCKISH_TAGS.has(child.tagName.toUpperCase()) && !isHiddenElement(child, visibility)) return true;
    if (INLINE_WRAPPER_TAGS.has(child.tagName.toUpperCase())) continue;
    if (hasBlockishChild(child, visibility)) return true;
  }
  return false;
}

function isEligibleElement(
  element: HTMLElement,
  options: { allowInNavigation: boolean },
  visibility: StyleCache,
): boolean {
  if (isOwnNode(element)) return false;
  if (isInsideCode(element)) return false;
  if (isInsideSkippedContainer(element)) return false;
  if (isInsideEditableRegion(element)) return false;
  if (isHiddenElement(element, visibility)) return false;
  if (isChartRegion(element)) return false;
  if (!options.allowInNavigation && element.closest(BODY_EXCLUDED_ANCESTOR) !== null) return false;
  return true;
}

/**
 * 元素自身的文字（排除内部交互控件的内容）。
 *
 * 「只有一个按钮或链接的容器」经常被当成正文段落，于是按钮旁边又多出一份译文；
 * 这类容器没有自己的文字，应该交给界面文本就地翻译，而不是当正文重复翻译一遍。
 */
function proseTextOutsideControls(element: Element, visibility: StyleCache): string {
  let directText = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) directText += node.nodeValue ?? '';
  }
  // 大多数段落有自己的直接文本，不必为了判断“是否只有控件”再遍历整棵子树。
  if (normalizeText(directText)) return normalizeText(directText);

  let text = '';

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const child = node as Element;
    if (child !== element && child.matches(INTERFACE_SELECTOR)) return;
    if (isSkippedElement(child, visibility)) return;
    for (const grandChild of Array.from(child.childNodes)) walk(grandChild);
  };

  walk(element);
  return normalizeText(text);
}

function eligiblePayload(element: HTMLElement, allowInNavigation: boolean, visibility: StyleCache): InlinePayload | null {
  if (!isEligibleElement(element, { allowInNavigation }, visibility)) return null;
  return buildInlinePayload(element, visibility);
}

/**
 * 仓库元数据这类“多链接/短标签拼起来的一行”不是正文。
 * 在它下面插入整块译文会把下一行挤开，应该交给行内界面文本处理，或保持原样。
 */
function isInlineControlRow(element: HTMLElement): boolean {
  if (element.tagName.toUpperCase() !== 'DIV') return false;

  let directText = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) directText += node.nodeValue ?? '';
  }
  if (normalizeText(directText).length >= 30) return false;
  if (element.querySelector(INTERFACE_SELECTOR) === null) return false;
  return true;
}

/**
 * 一行里塞了三个以上数字、几乎没有句子结构的容器通常是排行榜/价格表的一行。
 * 它不适合在下面再插一整行译文，否则会把表格或网格布局挤乱。
 */
function looksLikeDataRow(element: HTMLElement, text = normalizeText(element.textContent ?? '')): boolean {
  if (element.tagName.toUpperCase() !== 'DIV') return false;

  if (text.length > 240) return false;
  const digits = text.match(/\d/g)?.length ?? 0;
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g)?.length ?? 0;
  // 小数点不是句号："$11.55" 不应被当成句子结尾。
  const sentenceEnd = /[!?。！？]|\.(?:\s|$)/.test(text);
  return digits >= 3 && words > 0 && words <= 16 && !sentenceEnd;
}

function collectBodyCandidates(
  roots: readonly Element[],
  visibility: StyleCache,
  knownBodyElements: ReadonlySet<Element>,
): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<Element>();

  const consider = (element: HTMLElement, requireInlineOnly: boolean): void => {
    if (seen.has(element)) return;
    seen.add(element);

    if (!isEligibleElement(element, { allowInNavigation: false }, visibility)) return;
    // 先做便宜的布局判断，避免为图表、flex 行和固定高度卡片构建整段 payload。
    if (!isBodyTargetLayoutSafe(element, visibility)) return;

    if (requireInlineOnly) {
      // 先看结构：整页布局包装 div 会在第一层就命中块级子元素，不必读取整棵子树的文本。
      if (hasBlockishChild(element, visibility)) return;
      const text = normalizeText(element.textContent ?? '');
      if (text.length < DIV_MIN_TEXT_LENGTH) return;
      if (looksLikeDataRow(element, text)) return;
      if (isInlineControlRow(element)) return;
    }

    const payload = buildInlinePayload(element, visibility);
    if (!payload) return;
    if (!proseTextOutsideControls(element, visibility)) {
      // 内容标题常常只有一个链接作为全部文字（如 Stack Overflow 问题标题）；
      // 它不是导航控件，应保留英文并在下方显示译文。
      const isContentHeading =
        /^H[1-6]$/.test(element.tagName.toUpperCase()) &&
        normalizeText(element.textContent ?? '').length >= 16 &&
        element.closest('header, [role="banner"]') === null;
      if (!isContentHeading) return;
    }

    candidates.push({ element, payload });
  };

  for (const root of roots) {
    if (root instanceof HTMLElement && root.matches(BODY_SELECTOR)) consider(root, false);
    if (root instanceof HTMLElement && root.tagName === 'DIV') consider(root, true);

    for (const element of Array.from(root.querySelectorAll<HTMLElement>(BODY_SELECTOR))) {
      consider(element, false);
    }
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('div'))) {
      consider(element, true);
    }
  }

  // 已知正文单元是一个边界：只允许它本身参与重扫，不允许在它内部再建立嵌套单元。
  const bounded = candidates.filter(
    (candidate) => knownBodyElements.has(candidate.element) || !hasBodyAncestor(candidate.element, knownBodyElements),
  );
  return keepInnermost(bounded);
}

/** 只保留最内层正文单元：`<li><p>…</p></li>` 只翻译 p，避免同一段文字重复提交。 */
function keepInnermost(candidates: Candidate[]): Candidate[] {
  const candidateElements = new Set(candidates.map((candidate) => candidate.element));
  const hasKeptDescendant = new Set<Element>();
  const kept: Candidate[] = [];

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    if (hasKeptDescendant.has(candidate.element)) continue;
    kept.push(candidate);
    for (let parent = candidate.element.parentElement; parent; parent = parent.parentElement) {
      if (candidateElements.has(parent)) hasKeptDescendant.add(parent);
    }
  }

  return kept.reverse();
}

function hasBodyAncestor(element: Element, bodyElements: ReadonlySet<Element>): boolean {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (bodyElements.has(parent)) return true;
  }
  return false;
}

function collectInterfaceCandidates(
  roots: readonly Element[],
  bodyElements: ReadonlySet<Element>,
  visibility: StyleCache,
): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<Element>();

  const consider = (element: HTMLElement): void => {
    if (seen.has(element)) return;
    seen.add(element);

    if (!element.matches(INTERFACE_SELECTOR)) return;
    if (bodyElements.has(element)) return;
    if (hasBodyAncestor(element, bodyElements)) return;
    if (element.parentElement?.closest(INTERFACE_SELECTOR)) return;
    if (hasBlockishChild(element, visibility)) return;

    const payload = eligiblePayload(element, true, visibility);
    if (!payload) return;

    const words = payload.text.match(/[A-Za-z][A-Za-z'’-]*/g)?.length ?? 0;
    if (words === 0 || words > INTERFACE_MAX_WORDS) return;

    candidates.push({ element, payload });
  };

  for (const root of roots) {
    if (root instanceof HTMLElement) consider(root);
    for (const element of Array.from(root.querySelectorAll<HTMLElement>(INTERFACE_SELECTOR))) {
      consider(element);
    }
  }

  return candidates;
}

/**
 * 扫描页面中当前的待翻译内容：
 * 正文（段落、列表、标题等）与界面文本（链接、按钮、菜单项、标签）。
 * 语言判断不在这里进行，由页面翻译会话按单元决定是否提交。
 */
export interface ScanTranslatableOptions {
  /** 只扫描这些子树；用于动态内容增量重扫。 */
  roots?: readonly Element[];
  /** 会话已建立的正文单元，避免重扫时在它们内部创建嵌套单元。 */
  knownBodyElements?: ReadonlySet<Element>;
}

export function scanTranslatableTargets(
  doc: Document = document,
  options: ScanTranslatableOptions = {},
): TranslatableTarget[] {
  const bodyRoot = doc.body;
  if (!bodyRoot) return [];

  const visibility = new StyleCache(doc);
  const roots = options.roots && options.roots.length > 0 ? options.roots : [bodyRoot];
  const knownBodyElements = options.knownBodyElements ?? new Set<Element>();
  const body = collectBodyCandidates(roots, visibility, knownBodyElements);
  const bodyElements = new Set(body.map((candidate) => candidate.element));
  const allBodyElements = new Set([...knownBodyElements, ...bodyElements]);
  const interfaceCandidates = collectInterfaceCandidates(roots, allBodyElements, visibility);

  return [...body, ...interfaceCandidates].map(({ element, payload }) => ({
    element,
    kind: bodyElements.has(element) ? 'body' : 'interface',
    text: payload.text,
    formats: payload.formats,
    fingerprint: fingerprintText(expandOpaqueMarkers(payload.text, payload.formats)),
  }));
}

/** 仅用于自动翻译判断：页面是否存在足够的英文内容。 */
export function collectTranslatableTexts(doc: Document = document): string[] {
  return scanTranslatableTargets(doc).map((target) => target.text);
}
