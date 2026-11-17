import { normalizeText } from '@/shared/text';
import type { TranslationContext } from '../translation-contract/types';

const PAGE_TITLE_LIMIT = 120;
const SECTION_TITLE_LIMIT = 120;
const PREVIOUS_TEXT_LIMIT = 200;

/**
 * 划词翻译的只读上下文：页面标题、当前小节标题和前一段原文。
 * 只用于帮助理解术语与语气，不会被要求翻译。
 */
export function buildSelectionContext(doc: Document, anchor: Element | null): TranslationContext | undefined {
  const context: TranslationContext = {};

  const pageTitle = truncate(normalizeText(doc.title ?? ''), PAGE_TITLE_LIMIT);
  if (pageTitle) context.pageTitle = pageTitle;

  const sectionTitle = findSectionTitle(anchor);
  if (sectionTitle) context.sectionTitle = sectionTitle;

  const previousText = findPreviousText(anchor);
  if (previousText) context.previousText = previousText;

  return Object.keys(context).length > 0 ? context : undefined;
}

function findSectionTitle(anchor: Element | null): string | undefined {
  if (!anchor) return undefined;

  for (let sibling = anchor.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (!/^H[1-6]$/.test(sibling.tagName)) continue;
    const text = truncate(normalizeText(sibling.textContent ?? ''), SECTION_TITLE_LIMIT);
    if (text) return text;
  }

  const container = anchor.closest('section, article, main, [role="main"]');
  const heading = container?.querySelector('h1, h2, h3, h4, h5, h6');
  if (!heading) return undefined;

  const text = truncate(normalizeText(heading.textContent ?? ''), SECTION_TITLE_LIMIT);
  return text || undefined;
}

function findPreviousText(anchor: Element | null): string | undefined {
  if (!anchor) return undefined;

  for (let sibling = anchor.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    // 跳过插件自己插入的节点与标题，避免上下文变成重复的标题文本。
    if (sibling.hasAttribute('data-aiwt')) continue;
    if (/^H[1-6]$/.test(sibling.tagName)) continue;

    const text = truncate(normalizeText(sibling.textContent ?? ''), PREVIOUS_TEXT_LIMIT);
    if (text) return text;
  }

  return undefined;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
