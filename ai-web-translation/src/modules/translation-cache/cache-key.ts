import { normalizeText } from '@/shared/text';

/** 目标语言固定为简体中文；源语言首版只承诺英文。 */
export const CACHE_SOURCE_LANGUAGE = 'en';
export const CACHE_TARGET_LANGUAGE = 'zh-CN';

/**
 * 影响译文结果的全部输入。
 * 故意不包含 API Key 与自定义请求头：凭据不属于译文语义。
 */
export interface TranslationCacheDescriptor {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  serviceUrl: string;
  model: string;
  prompt: string;
  extraParams: Record<string, unknown>;
}

/**
 * 缓存键：规范化原文 + 语言方向 + 翻译服务 + 模型 + 提示词 + 有效请求参数。
 *
 * 同一份存储里只保留键，实际原文单独保存在记录中并在读取时逐字校验，
 * 因此哈希碰撞不会把别的原文译文套用过来。
 */
export function createCacheKey(descriptor: TranslationCacheDescriptor): string {
  const material = [
    descriptor.sourceLanguage,
    descriptor.targetLanguage,
    descriptor.serviceUrl.trim(),
    descriptor.model.trim(),
    descriptor.prompt,
    stableStringify(descriptor.extraParams),
    normalizeText(descriptor.sourceText),
  ].join('\u0000');

  return `${fnv1a64(material)}:${material.length.toString(36)}`;
}

/** 键顺序不影响结果：按对象键排序后再序列化。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

/** 两段 32 位 FNV-1a，降低键碰撞概率。 */
function fnv1a64(text: string): string {
  let high = 0x811c9dc5;
  let low = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    high = Math.imul(high ^ code, 0x01000193);
    low = Math.imul(low ^ code, 0x85ebca6b);
  }

  return `${(high >>> 0).toString(16)}${(low >>> 0).toString(16)}`;
}
