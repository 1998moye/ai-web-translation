import { sanitizeError, TranslationError } from '../translation-contract/sanitized-error';
import type { SanitizedTranslationError } from '../translation-contract/types';
import type { TranslationProfileDraft } from '../translation-profile/profile';
import type { HttpAdapter } from './http-adapter';
import { buildChatCompletionRequest } from './request';
import { extractCompletionContent, parseTranslationResult } from './response';

/** 固定的英文测试短句：不读取页面内容，也不进入译文缓存。 */
export const CONNECTION_TEST_SENTENCE = 'The quick brown fox jumps over the lazy dog.';

export const CONNECTION_TEST_UNIT_ID = 'unit_connection_test';

export interface ConnectionTestInput {
  profile: TranslationProfileDraft;
  prompt: string;
  http: HttpAdapter;
}

export type ConnectionTestResult =
  | { ok: true; translation: string }
  | { ok: false; error: SanitizedTranslationError };

/**
 * 用一份完整配置发起一次真实 Chat Completions 请求。
 * 失败信息统一脱敏，可以直接展示在设置页。
 */
export async function runConnectionTest(input: ConnectionTestInput): Promise<ConnectionTestResult> {
  const request = buildChatCompletionRequest({
    profile: input.profile,
    prompt: input.prompt,
    units: [{ id: CONNECTION_TEST_UNIT_ID, kind: 'body', text: CONNECTION_TEST_SENTENCE }],
  });

  try {
    const outcome = await input.http.send(request);
    const content = extractCompletionContent(outcome);
    const parsed = parseTranslationResult(content, [CONNECTION_TEST_UNIT_ID]);
    const translation = parsed.translations.get(CONNECTION_TEST_UNIT_ID);
    if (translation === undefined) throw new TranslationError('response-invalid');
    return { ok: true, translation };
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
}
