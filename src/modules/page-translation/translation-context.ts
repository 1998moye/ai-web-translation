import { normalizeText } from '@/shared/text';
import { OWN_NODE_ATTRIBUTE } from '../inline-format/inline-format';
import type { TranslationContext } from '../translation-contract/types';

const CONTEXT_TEXT_LIMIT = 200;
const SECTION_TITLE_LIMIT = 120;

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function findSectionTitle(element: Element): string | undefined {
  const container = element.closest('section, article, main, [role="main"]');
  const heading = container?.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    const text = normalizeText(heading.textContent ?? '');
    if (text) return truncate(text, SECTION_TITLE_LIMIT);
  }

  for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (/^H[1-6]$/.test(sibling.tagName)) {
      const text = normalizeText(sibling.textContent ?? '');
      if (text) return truncate(text, SECTION_TITLE_LIMIT);
    }
  }

  return undefined;
}

function findPreviousBodyText(element: Element, bodyElements: ReadonlySet<Element>): string | undefined {
  for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (sibling.hasAttribute(OWN_NODE_ATTRIBUTE)) continue;
    if (!bodyElements.has(sibling)) continue;
    const text = normalizeText(sibling.textContent ?? '');
    if (text) return truncate(text, CONTEXT_TEXT_LIMIT);
  }
  return undefined;
}

/**
 * 正文单元的只读上下文：页面标题、当前小节标题和前一段原文。
 * 短界面文本不附加上下文，避免无关内容稀释提示词。
 */
export function buildTranslationContext(
  doc: Document,
  unitElement: Element,
  bodyElements: ReadonlySet<Element>,
): TranslationContext | undefined {
  const pageTitle = truncate(normalizeText(doc.title ?? ''), SECTION_TITLE_LIMIT);
  const sectionTitle = findSectionTitle(unitElement);
  const previousText = findPreviousBodyText(unitElement, bodyElements);

  const context: TranslationContext = {};
  if (pageTitle) context.pageTitle = pageTitle;
  if (sectionTitle) context.sectionTitle = sectionTitle;
  if (previousText) context.previousText = previousText;

  return Object.keys(context).length > 0 ? context : undefined;
}
