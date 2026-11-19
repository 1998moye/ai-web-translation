import { normalizeText } from '@/shared/text';
import { classifyText } from '../language/language';

/** 中日韩文字与全角标点：这些内容已经有中文，不作为待翻译片段。 */
const CJK_RUN = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\uac00-\ud7af]+/g;

/** 用于切断中日韩文字的内部标记，不会被空白折叠吃掉。 */
const SEGMENT_BREAK = '\u0000';

export function containsCjk(text: string): boolean {
  return new RegExp(CJK_RUN.source).test(text);
}

/** 单个单元的长度上限：超过后按词边界再拆，避免一个单元占满整个请求。 */
const MAX_SEGMENT_CHARS = 800;

/**
 * 把选区文本拆成只包含英文的可翻译片段。
 *
 * 中英混排时只提交英文部分：先按中日韩文字边界切断，再把换行与缩进
 * （网页源码里的排版空白，不是句子边界）折叠成空格，最后按句子拆分并用
 * 统一的语言识别规则过滤。
 */
export function extractTranslatableSegments(text: string): string[] {
  const segments: string[] = [];

  for (const chunk of text.replace(CJK_RUN, SEGMENT_BREAK).split(SEGMENT_BREAK)) {
    const collapsed = normalizeText(chunk);
    if (!collapsed) continue;

    for (const sentence of collapsed.split(/(?<=[.!?;:])\s+/)) {
      const normalized = normalizeText(sentence);
      if (!normalized) continue;
      if (classifyText(normalized) !== 'english') continue;
      segments.push(...splitLongSegment(normalized));
    }
  }

  return segments;
}

/** 超长片段按词边界切成多个可独立翻译的单元。 */
function splitLongSegment(text: string): string[] {
  if (text.length <= MAX_SEGMENT_CHARS) return [text];

  const chunks: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length > MAX_SEGMENT_CHARS) {
      chunks.push(current);
      current = word;
      continue;
    }
    current = `${current} ${word}`;
  }

  if (current) chunks.push(current);
  return chunks;
}
