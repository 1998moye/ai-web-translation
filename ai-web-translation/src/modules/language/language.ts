import { normalizeText } from '@/shared/text';

export type TextLanguage = 'english' | 'non-english' | 'untranslatable';

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const LATIN_LETTER_PATTERN = /[A-Za-z]/g;
const WORD_PATTERN = /[A-Za-z][A-Za-z'’-]*/g;

const ENGLISH_STOPWORDS = new Set([
  'the', 'and', 'of', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'in', 'on', 'at', 'for', 'with',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'by', 'from', 'or', 'an', 'not', 'you', 'your', 'we', 'our',
  'they', 'their', 'he', 'she', 'his', 'her', 'but', 'if', 'then', 'than', 'so', 'can', 'will', 'would', 'should',
  'could', 'has', 'have', 'had', 'do', 'does', 'did', 'there', 'here', 'what', 'when', 'where', 'which', 'who',
  'how', 'all', 'more', 'most', 'other', 'into', 'over', 'after', 'before', 'about', 'up', 'out', 'no', 'yes',
]);

/** 只收录不容易与英文单词混淆的常见非英文虚词，用于区分明显非英文页面。 */
const FOREIGN_STOPWORDS = new Set([
  'der', 'das', 'und', 'ist', 'sind', 'nicht', 'eine', 'einen', 'einem', 'mit', 'für', 'auf', 'von', 'dem', 'den',
  'des', 'ich', 'wir', 'auch', 'oder', 'aber', 'le', 'la', 'les', 'une', 'est', 'sont', 'que', 'qui', 'pour',
  'dans', 'avec', 'sur', 'pas', 'vous', 'nous', 'ils', 'elles', 'cette', 'ces', 'aux', 'los', 'las', 'una', 'uno',
  'para', 'por', 'del', 'como', 'más', 'pero', 'gli', 'della', 'delle', 'dei', 'nel', 'nella', 'non', 'anche',
]);

export interface PageLanguageSummary {
  isEnglish: boolean;
  englishUnits: number;
  latinUnits: number;
  chineseUnits: number;
}

/**
 * 按翻译单元判断语言。规则有意保守：
 * - 含中日韩字符的单元视为已有中文内容，不提交翻译；
 * - 拉丁字母占比过低的单元（纯数字、符号）不提交翻译；
 * - 出现明显非英文虚词（法语、德语、西语等）时判为非英文；
 * - 没有虚词的短标签（按钮、菜单）按英文处理。
 */
export function classifyText(text: string): TextLanguage {
  const source = normalizeText(text.replace(/⟦[\/ow]\d+⟧/g, ' '));
  if (!source) return 'untranslatable';
  if (CJK_PATTERN.test(source)) return 'non-english';

  const letters = source.match(LATIN_LETTER_PATTERN)?.length ?? 0;
  const visibleLength = source.replace(/\s/g, '').length;
  if (letters === 0 || visibleLength === 0) return 'untranslatable';
  if (letters / visibleLength < 0.5) return 'untranslatable';

  const words = (source.match(WORD_PATTERN) ?? []).map((word) => word.toLowerCase());
  if (words.length === 0) return 'untranslatable';

  let english = 0;
  let foreign = 0;
  for (const word of words) {
    if (ENGLISH_STOPWORDS.has(word)) english += 1;
    else if (FOREIGN_STOPWORDS.has(word)) foreign += 1;
  }

  if (foreign > english) return 'non-english';
  if (english > 0) return 'english';
  return words.length <= 6 ? 'english' : 'non-english';
}

/** 页面级英文判断：用于按网站自动翻译，避免对非英文网站发起无意义请求。 */
export function summarizePageLanguage(texts: readonly string[]): PageLanguageSummary {
  let englishUnits = 0;
  let latinUnits = 0;
  let chineseUnits = 0;

  for (const text of texts) {
    const language = classifyText(text);
    if (language === 'english') {
      englishUnits += 1;
      latinUnits += 1;
    } else if (language === 'non-english') {
      if (CJK_PATTERN.test(text)) chineseUnits += 1;
      else latinUnits += 1;
    }
  }

  const isEnglish =
    englishUnits >= 2 && englishUnits / Math.max(latinUnits, 1) >= 0.6 && chineseUnits <= latinUnits;

  return { isEnglish, englishUnits, latinUnits, chineseUnits };
}
