import { describe, expect, it } from 'vitest';
import {
  buildChatCompletionRequest,
  type ChatCompletionRequestInput,
} from '@/modules/translation-chat-completions/request';
import {
  extractCompletionContent,
  parseTranslationResult,
} from '@/modules/translation-chat-completions/response';
import { TranslationError } from '@/modules/translation-contract/sanitized-error';
import type { TranslationUnit } from '@/modules/translation-contract/types';
import { createProfileDraft, type TranslationProfile } from '@/modules/translation-profile/profile';
import { completionOutcome, textOutcome } from './helpers/mock-http';

const API_KEY = 'sk-live-secret-abcd1234';
const PROMPT = '把英文翻译成简体中文，只返回 {"translations":[{"id","text"}]}。';

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

const UNITS: TranslationUnit[] = [
  { id: 'unit_1', kind: 'body', text: 'Hello world.' },
  { id: 'unit_2', kind: 'interface', text: 'Settings' },
];

function input(overrides: Partial<ChatCompletionRequestInput> = {}): ChatCompletionRequestInput {
  return { profile: profile(), prompt: PROMPT, units: UNITS, ...overrides };
}

function bodyOf(request: { body: string }): Record<string, unknown> {
  return JSON.parse(request.body) as Record<string, unknown>;
}

function userPayload(request: { body: string }): Record<string, unknown> {
  const messages = bodyOf(request).messages as { role: string; content: string }[];
  return JSON.parse(messages[1]?.content ?? '{}') as Record<string, unknown>;
}

describe('buildChatCompletionRequest', () => {
  it('向配置的完整地址发送 JSON 请求', () => {
    const request = buildChatCompletionRequest(input());

    expect(request.url).toBe('https://api.example.com/v1/chat/completions');
    expect(request.method).toBe('POST');
    expect(request.headers['Content-Type']).toBe('application/json');
  });

  it('由引擎管理 model、messages 与 stream', () => {
    const request = buildChatCompletionRequest(input());
    const body = bodyOf(request);

    expect(body.model).toBe('gpt-4o-mini');
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: 'system', content: PROMPT },
      { role: 'user', content: expect.any(String) },
    ]);
  });

  it('额外请求参数并入请求体', () => {
    const request = buildChatCompletionRequest(
      input({ profile: profile({ extraParams: { reasoning_effort: 'none', temperature: 0.2 } }) }),
    );

    expect(bodyOf(request).reasoning_effort).toBe('none');
    expect(bodyOf(request).temperature).toBe(0.2);
  });

  it('额外参数不能覆盖 model、messages 与 stream', () => {
    const request = buildChatCompletionRequest(
      input({
        profile: profile({ extraParams: { model: 'evil-model', messages: [], stream: true } }),
      }),
    );
    const body = bodyOf(request);

    expect(body.model).toBe('gpt-4o-mini');
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
  });

  it('API Key 非空时生成 Bearer Authorization', () => {
    const request = buildChatCompletionRequest(input());

    expect(request.headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('API Key 留空时使用自定义认证请求头', () => {
    const request = buildChatCompletionRequest(
      input({ profile: profile({ apiKey: '', headers: { Authorization: 'Bearer other-token' } }) }),
    );

    expect(request.headers.Authorization).toBe('Bearer other-token');
  });

  it('自定义请求头随请求发送', () => {
    const request = buildChatCompletionRequest(input({ profile: profile({ headers: { 'X-Tenant': 'team-a' } }) }));

    expect(request.headers['X-Tenant']).toBe('team-a');
    expect(request.headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('用户消息携带单元 ID、原文和只读上下文，上下文不进入单元列表', () => {
    const request = buildChatCompletionRequest(
      input({
        units: [UNITS[0]!],
        context: { pageTitle: 'Example Domain', sectionTitle: 'Overview', previousText: 'Earlier paragraph.' },
      }),
    );
    const payload = userPayload(request);

    expect(payload.units).toEqual([{ id: 'unit_1', text: 'Hello world.' }]);
    expect(payload.context).toEqual({
      pageTitle: 'Example Domain',
      sectionTitle: 'Overview',
      previousText: 'Earlier paragraph.',
    });
  });

  it('没有上下文时不发送 context 字段', () => {
    expect(userPayload(buildChatCompletionRequest(input()))).not.toHaveProperty('context');
  });

  it('任务运行参数不进入请求体', () => {
    const request = buildChatCompletionRequest(
      input({ profile: profile({ runtime: { concurrency: 5, timeoutMs: 90_000, retryCount: 1 } }) }),
    );
    const body = bodyOf(request);

    expect(body).not.toHaveProperty('concurrency');
    expect(body).not.toHaveProperty('timeoutMs');
    expect(body).not.toHaveProperty('retryCount');
    expect(body).not.toHaveProperty('runtime');
  });
});

describe('extractCompletionContent', () => {
  it('取出助手回复文本', () => {
    expect(extractCompletionContent(completionOutcome('你好。'))).toBe('你好。');
  });

  it('非 Chat Completions 结构被视为响应格式错误', () => {
    expect(() => extractCompletionContent(textOutcome('{"unexpected":true}'))).toThrowError(TranslationError);
    expect(() => extractCompletionContent(textOutcome('<html>gateway</html>'))).toThrowError(/无法解析|格式/);
  });

  it('空回复被视为响应格式错误', () => {
    expect(() => extractCompletionContent(completionOutcome('   '))).toThrowError(TranslationError);
  });

  it('脱敏错误不包含 API Key', () => {
    try {
      extractCompletionContent(textOutcome('nope'));
    } catch (error) {
      expect(error).toBeInstanceOf(TranslationError);
      expect((error as TranslationError).toSanitized().message).not.toContain(API_KEY);
    }
  });
});

describe('parseTranslationResult', () => {
  it('解析为单元 ID 到译文的映射', () => {
    const result = parseTranslationResult(
      '{"translations":[{"id":"unit_1","text":"你好，世界。"},{"id":"unit_2","text":"设置"}]}',
    );

    expect(Object.fromEntries(result.translations)).toEqual({
      unit_1: '你好，世界。',
      unit_2: '设置',
    });
    expect(result.missingIds).toEqual([]);
    expect(result.duplicateIds).toEqual([]);
  });

  it('容忍代码围栏，但不接受无法解析的内容', () => {
    expect(
      parseTranslationResult('```json\n{"translations":[{"id":"unit_1","text":"你好。"}]}\n```').translations.get(
        'unit_1',
      ),
    ).toBe('你好。');
    expect(() => parseTranslationResult('好的，译文如下：你好。')).toThrowError(TranslationError);
  });

  it('缺少 translations 数组或内容不含约定结构时报响应格式错误', () => {
    expect(() => parseTranslationResult('{"result":[]}')).toThrowError(TranslationError);
    expect(() => parseTranslationResult('{"translations":"nope"}')).toThrowError(TranslationError);
    expect(() => parseTranslationResult('{"translations":[{"id":1,"text":2}]}')).toThrowError(TranslationError);
  });

  it('重复与未知单元 ID 不被猜测性渲染', () => {
    const result = parseTranslationResult(
      '{"translations":[{"id":"unit_1","text":"甲"},{"id":"unit_1","text":"乙"},{"id":"unit_x","text":"丙"}]}',
      ['unit_1', 'unit_2'],
    );

    expect(result.translations.has('unit_1')).toBe(false);
    expect(result.duplicateIds).toEqual(['unit_1']);
    expect(result.unknownIds).toEqual(['unit_x']);
    expect(result.missingIds).toEqual(['unit_1', 'unit_2']);
    expect(result.translations.size).toBe(0);
  });
});
