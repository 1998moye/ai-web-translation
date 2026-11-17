import { TranslationError } from '../translation-contract/sanitized-error';
import { errorForHttpFailure, errorForHttpStatus } from './errors';
import type { HttpOutcome } from './http-adapter';

export interface TranslationParseResult {
  /** 通过校验的单元 ID 到译文映射。 */
  translations: Map<string, string>;
  /** 请求中要求但响应未返回的单元。 */
  missingIds: string[];
  /** 重复出现的单元 ID：无法判断哪条正确，全部丢弃。 */
  duplicateIds: string[];
  /** 响应中出现但本次请求没有的单元 ID。 */
  unknownIds: string[];
}

/**
 * 从 HTTP 结果读取助手回复文本。
 * 非 2xx、传输失败和结构不符都转换为脱敏错误，绝不回显响应体或请求头。
 */
export function extractCompletionContent(outcome: HttpOutcome): string {
  if (!outcome.ok) throw errorForHttpFailure(outcome.reason);
  if (outcome.status < 200 || outcome.status >= 300) throw errorForHttpStatus(outcome.status, outcome.headers);

  const content = readAssistantContent(safeJsonParse(outcome.text));
  if (!content || !content.trim()) throw new TranslationError('response-invalid');
  return content.trim();
}

/**
 * 解析约定的结构化译文。
 * 缺失、重复、未知或无法解析的 ID 一律不猜测性渲染。
 */
export function parseTranslationResult(
  content: string,
  knownIds?: readonly string[],
): TranslationParseResult {
  const json = extractJsonObject(content);
  const parsed = json === undefined ? undefined : safeJsonParse(json);
  if (!isRecord(parsed) || !Array.isArray(parsed.translations)) {
    throw new TranslationError('response-invalid');
  }

  const seen = new Map<string, string | null>();
  for (const entry of parsed.translations) {
    if (!isRecord(entry)) throw new TranslationError('response-invalid');
    const { id, text } = entry;
    if (typeof id !== 'string' || !id.trim() || typeof text !== 'string') {
      throw new TranslationError('response-invalid');
    }
    // 重复 ID 记为 null，稍后整条丢弃。
    seen.set(id, seen.has(id) ? null : text);
  }

  const known = knownIds ? new Set(knownIds) : null;
  const translations = new Map<string, string>();
  const duplicateIds: string[] = [];
  const unknownIds: string[] = [];

  for (const [id, text] of seen) {
    if (text === null) {
      duplicateIds.push(id);
      continue;
    }
    if (known && !known.has(id)) {
      unknownIds.push(id);
      continue;
    }
    translations.set(id, text);
  }

  const missingIds = knownIds ? knownIds.filter((id) => !translations.has(id)) : [];
  return { translations, missingIds, duplicateIds, unknownIds };
}

function readAssistantContent(parsed: unknown): string | undefined {
  if (!isRecord(parsed) || !Array.isArray(parsed.choices) || parsed.choices.length === 0) return undefined;
  const choice = parsed.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
  const content = choice.message.content;
  return typeof content === 'string' ? content : undefined;
}

function extractJsonObject(content: string): string | undefined {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  return content.slice(start, end + 1);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
