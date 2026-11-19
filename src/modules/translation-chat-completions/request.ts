import type { TranslationContext, TranslationUnit } from '../translation-contract/types';
import type { TranslationProfileDraft } from '../translation-profile/profile';
import { resolveRequestUrl } from '../translation-profile/request-format';
import type { HttpRequest } from './http-adapter';

export interface ChatCompletionRequestInput {
  profile: TranslationProfileDraft;
  prompt: string;
  units: readonly TranslationUnit[];
  context?: TranslationContext;
}

/**
 * 构造 Chat Completions 请求。
 *
 * model、messages、stream 由 Translation Engine 决定，额外请求参数先并入再被核心字段覆盖，
 * 即使保存校验被绕过也不会破坏请求协议。
 */
export function buildChatCompletionRequest(input: ChatCompletionRequestInput): HttpRequest {
  const { profile, prompt, units, context } = input;

  const payload: Record<string, unknown> = {
    units: units.map((unit) => ({ id: unit.id, text: unit.text })),
  };
  if (context) payload.context = context;

  const body: Record<string, unknown> = {
    ...profile.extraParams,
    model: profile.model,
    stream: false,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  };

  return {
    // 用户只填基础地址时在这里补全，请求地址与缓存键都使用补全后的完整端点。
    url: resolveRequestUrl(profile.url, profile.requestFormat),
    method: 'POST',
    headers: buildChatCompletionHeaders(profile),
    body: JSON.stringify(body),
  };
}

/** API Key 非空时生成 Bearer；已有自定义 Authorization 时以用户配置为准。 */
export function buildChatCompletionHeaders(profile: TranslationProfileDraft): Record<string, string> {
  // 大小写不敏感地合并，避免用户写小写 content-type 时出现重复请求头。
  const merged = new Map<string, { name: string; value: string }>();
  const set = (name: string, value: string): void => {
    merged.set(name.toLowerCase(), { name, value });
  };

  set('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(profile.headers)) set(name, value);

  const apiKey = profile.apiKey.trim();
  if (apiKey && !merged.has('authorization')) set('Authorization', `Bearer ${apiKey}`);

  const headers: Record<string, string> = {};
  for (const { name, value } of merged.values()) headers[name] = value;
  return headers;
}
