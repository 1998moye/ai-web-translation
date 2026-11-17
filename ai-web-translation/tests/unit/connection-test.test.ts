import { describe, expect, it } from 'vitest';
import {
  CONNECTION_TEST_SENTENCE,
  runConnectionTest,
} from '@/modules/translation-chat-completions/connection-test';
import { createProfileDraft, type TranslationProfile } from '@/modules/translation-profile/profile';
import { createMockHttpAdapter, completionOutcome, textOutcome } from './helpers/mock-http';

const API_KEY = 'sk-live-secret-abcd1234';
const PROMPT = '只输出 {"translations":[{"id","text"}]}。';

function profile(overrides: Partial<TranslationProfile> = {}): TranslationProfile {
  return {
    id: 'prof_1',
    ...createProfileDraft({
      name: '主力服务',
      url: 'https://api.example.com/v1/chat/completions',
      apiKey: API_KEY,
      model: 'gpt-4o-mini',
    }),
    ...overrides,
  };
}

function bodyOf(request: { body: string }): Record<string, unknown> {
  return JSON.parse(request.body) as Record<string, unknown>;
}

describe('runConnectionTest', () => {
  it('用固定英文短句、当前提示词和完整配置发起真实请求', async () => {
    const http = createMockHttpAdapter(
      completionOutcome('{"translations":[{"id":"unit_connection_test","text":"敏捷的棕色狐狸跳过了懒狗。"}]}'),
    );

    await runConnectionTest({ profile: profile(), prompt: PROMPT, http });

    const request = http.requests[0];
    expect(http.requests).toHaveLength(1);
    expect(request?.url).toBe('https://api.example.com/v1/chat/completions');
    expect(request?.headers.Authorization).toBe(`Bearer ${API_KEY}`);

    const body = bodyOf(request!);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([
      { role: 'system', content: PROMPT },
      { role: 'user', content: expect.stringContaining(CONNECTION_TEST_SENTENCE) },
    ]);
  });

  it('成功时返回实际译文，而不是仅确认网络连通', async () => {
    const http = createMockHttpAdapter(
      completionOutcome('{"translations":[{"id":"unit_connection_test","text":"敏捷的棕色狐狸跳过了懒狗。"}]}'),
    );

    const result = await runConnectionTest({ profile: profile(), prompt: PROMPT, http });

    expect(result).toEqual({ ok: true, translation: '敏捷的棕色狐狸跳过了懒狗。' });
  });

  it('每次都发起真实请求，不读取译文缓存', async () => {
    const http = createMockHttpAdapter(
      completionOutcome('{"translations":[{"id":"unit_connection_test","text":"敏捷的棕色狐狸跳过了懒狗。"}]}'),
    );

    await runConnectionTest({ profile: profile(), prompt: PROMPT, http });
    await runConnectionTest({ profile: profile(), prompt: PROMPT, http });

    expect(http.requests).toHaveLength(2);
  });

  it('额外请求参数与当前提示词一起进入请求', async () => {
    const http = createMockHttpAdapter(
      completionOutcome('{"translations":[{"id":"unit_connection_test","text":"你好。"}]}'),
    );

    await runConnectionTest({
      profile: profile({ extraParams: { reasoning_effort: 'none', temperature: 0.2 } }),
      prompt: PROMPT,
      http,
    });

    const body = bodyOf(http.requests[0]!);
    expect(body.reasoning_effort).toBe('none');
    expect(body.temperature).toBe(0.2);
    expect(body.stream).toBe(false);
  });

  it.each([
    [400, 'request-invalid'],
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limited'],
    [500, 'server'],
    [503, 'server'],
  ])('HTTP %s 归类为 %s 且只请求一次', async (status, code) => {
    const http = createMockHttpAdapter(textOutcome('{"error":"denied"}', status));

    const result = await runConnectionTest({ profile: profile(), prompt: PROMPT, http });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(code);
    expect(http.requests).toHaveLength(1);
    expect(result.error.message).not.toContain(API_KEY);
  });

  it('429 带上服务返回的等待时间', async () => {
    const http = createMockHttpAdapter(textOutcome('', 429, { 'retry-after': '7' }));

    const result = await runConnectionTest({ profile: profile(), prompt: PROMPT, http });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.retryAfterMs).toBe(7000);
  });

  it('网络失败归类为 network，且不泄露请求细节', async () => {
    const http = createMockHttpAdapter({ ok: false, reason: 'network' });

    const result = await runConnectionTest({ profile: profile(), prompt: PROMPT, http });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('network');
    expect(result.error.message).not.toContain(API_KEY);
  });

  it('返回结构不符合约定时归类为响应格式错误', async () => {
    for (const content of ['好的，译文如下。', '{"translations":[]}', '{"translations":[{"id":"other","text":"甲"}]}']) {
      const http = createMockHttpAdapter(completionOutcome(content));

      const result = await runConnectionTest({ profile: profile(), prompt: PROMPT, http });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('response-invalid');
    }
  });
});
