import { fingerprintText, normalizeText } from '@/shared/text';
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

function hasBlockishChild(element: Element): boolean {
  for (const child of Array.from(element.children)) {
    if (BLOCKISH_TAGS.has(child.tagName.toUpperCase()) && !isHiddenElement(child)) return true;
    if (hasBlockishChild(child)) return true;
  }
  return false;
}

function isEligibleElement(element: HTMLElement, options: { allowInNavigation: boolean }): boolean {
  if (isOwnNode(element)) return false;
  if (isInsideCode(element)) return false;
  if (isInsideSkippedContainer(element)) return false;
  if (isInsideEditableRegion(element)) return false;
  if (isHiddenElement(element)) return false;
  if (!options.allowInNavigation && element.closest(BODY_EXCLUDED_ANCESTOR) !== null) return false;
  return true;
}

/**
 * 元素自身的文字（排除内部交互控件的内容）。
 *
 * 「只有一个按钮或链接的容器」经常被当成正文段落，于是按钮旁边又多出一份译文；
 * 这类容器没有自己的文字，应该交给界面文本就地翻译，而不是当正文重复翻译一遍。
 */
function proseTextOutsideControls(element: Element): string {
  let text = '';

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const child = node as Element;
    if (child !== element && child.matches(INTERFACE_SELECTOR)) return;
    if (isSkippedElement(child)) return;
    for (const grandChild of Array.from(child.childNodes)) walk(grandChild);
  };

  walk(element);
  return normalizeText(text);
}

function eligiblePayload(element: HTMLElement, allowInNavigation: boolean): InlinePayload | null {
  if (!isEligibleElement(element, { allowInNavigation })) return null;
  return buildInlinePayload(element);
}

function collectBodyCandidates(root: Element): Candidate[] {
  const candidates: Candidate[] = [];

  const consider = (element: HTMLElement, requireInlineOnly: boolean): void => {
    const payload = eligiblePayload(element, false);
    if (!payload) return;
    if (!proseTextOutsideControls(element)) return;
    if (requireInlineOnly) {
      if (hasBlockishChild(element)) return;
      if (normalizeText(element.textContent ?? '').length < DIV_MIN_TEXT_LENGTH) return;
    }
    candidates.push({ element, payload });
  };

  for (const element of Array.from(root.querySelectorAll<HTMLElement>(BODY_SELECTOR))) {
    consider(element, false);
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('div'))) {
    consider(element, true);
  }

  return keepInnermost(candidates);
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

function collectInterfaceCandidates(root: Element, bodyElements: ReadonlySet<Element>): Candidate[] {
  const candidates: Candidate[] = [];

  for (const element of Array.from(root.querySelectorAll<HTMLElement>(INTERFACE_SELECTOR))) {
    if (bodyElements.has(element)) continue;
    if (hasBodyAncestor(element, bodyElements)) continue;
    if (element.parentElement?.closest(INTERFACE_SELECTOR)) continue;
    if (hasBlockishChild(element)) continue;

    const payload = eligiblePayload(element, true);
    if (!payload) continue;

    const words = payload.text.match(/[A-Za-z][A-Za-z'’-]*/g)?.length ?? 0;
    if (words === 0 || words > INTERFACE_MAX_WORDS) continue;

    candidates.push({ element, payload });
  }

  return candidates;
}

/**
 * 扫描页面中当前的待翻译内容：
 * 正文（段落、列表、标题等）与界面文本（链接、按钮、菜单项、标签）。
 * 语言判断不在这里进行，由页面翻译会话按单元决定是否提交。
 */
export function scanTranslatableTargets(doc: Document = document): TranslatableTarget[] {
  const root = doc.body;
  if (!root) return [];

  const body = collectBodyCandidates(root);
  const bodyElements = new Set(body.map((candidate) => candidate.element));
  const interfaceCandidates = collectInterfaceCandidates(root, bodyElements);

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
