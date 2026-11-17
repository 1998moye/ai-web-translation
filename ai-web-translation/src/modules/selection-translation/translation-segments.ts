import { normalizeText } from '@/shared/text';
import { classifyText } from '../language/language';

/** 中日韩文字与全角标点：这些内容已经有中文，不作为待翻译片段。 */
const CJK_RUN = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\uac00-\ud7af]+/g;

export function containsCjk(text: string): boolean {
  return new RegExp(CJK_RUN.source).test(text);
}

/**
 * 把选区文本拆成只包含英文的可翻译片段。
 *
 * 中英混排时只提交英文部分：先按中日韩文字边界切断，
 * 再按句子与换行拆分，最后用统一的语言识别规则过滤。
 */
export function extractTranslatableSegments(text: string): string[] {
  const withoutCjk = text.replace(CJK_RUN, '\n');
  const pieces = withoutCjk.split(/\r?\n|(?<=[.!?;:])\s+/);

  const segments: string[] = [];
  for (const piece of pieces) {
    const normalized = normalizeText(piece);
    if (!normalized) continue;
    if (classifyText(normalized) !== 'english') continue;
    segments.push(normalized);
  }

  return segments;
}
