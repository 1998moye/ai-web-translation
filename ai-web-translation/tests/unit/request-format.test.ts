import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { runConnectionTest } from '@/modules/translation-chat-completions/connection-test';
import { buildChatCompletionRequest } from '@/modules/translation-chat-completions/request';
import { createProfileDraft, normalizeProfileDraft } from '@/modules/translation-profile/profile';
import { toDraft, toFormValues } from '@/modules/translation-profile/profile-form';
import { StoredTranslationProfiles, STORED_PROFILES_KEY } from '@/modules/translation-profile/profile-store';
import { validateProfileDraft } from '@/modules/translation-profile/profile-validation';
import {
  DEFAULT_REQUEST_FORMAT_ID,
  findRequestFormat,
  REQUEST_FORMATS,
  resolveRequestUrl,
} from '@/modules/translation-profile/request-format';
import { completionOutcome, createMockHttpAdapter } from './helpers/mock-http';

const units = [{ id: 'unit_1', kind: 'body' as const, text: 'Hello there.' }];

describe('请求方式', () => {
  it('当前只有 Chat Completions 一种方式，作为默认值', () => {
    expect(REQUEST_FORMATS.map((format) => format.id)).toEqual(['chat-completions']);
    expect(findRequestFormat('chat-completions')?.endpointPath).toBe('/chat/completions');
    expect(DEFAULT_REQUEST_FORMAT_ID).toBe('chat-completions');
    expect(findRequestFormat('anthropic-messages')).toBeNull();
  });
});

describe('resolveRequestUrl', () => {
  it('只填基础地址时补上接口路径', () => {
    expect(resolveRequestUrl('https://ollama.com/v1')).toBe('https://ollama.com/v1/chat/completions');
    expect(resolveRequestUrl('https://api.example.com')).toBe('https://api.example.com/chat/completions');
  });

  it('已经填写完整端点时原样保留，不重复补路径', () => {
    expect(resolveRequestUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });

  it('尾部斜杠与首尾空白不影响补全', () => {
    expect(resolveRequestUrl('  https://ollama.com/v1/  ')).toBe('https://ollama.com/v1/chat/completions');
    expect(resolveRequestUrl('https://api.example.com/v1/chat/completions/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });

  it('本机模型服务同样适用', () => {
    expect(resolveRequestUrl('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(resolveRequestUrl('http://localhost:8080')).toBe('http://localhost:8080/chat/completions');
  });

  it('空地址不做补全，交给地址校验报告问题', () => {
    expect(resolveRequestUrl('   ')).toBe('');
  });
});

describe('配置里的请求方式', () => {
  it('新配置默认使用 Chat Completions', () => {
    expect(createProfileDraft().requestFormat).toBe('chat-completions');
  });

  it('未知请求方式在归一化时回落到默认方式', () => {
    const draft = createProfileDraft({ requestFormat: 'unknown-format' as never });
    expect(normalizeProfileDraft(draft).requestFormat).toBe('chat-completions');
  });

  it('旧版本配置缺少请求方式时按 Chat Completions 读取', async () => {
    const storage = new MemoryKeyValueStorage();
    await storage.write(STORED_PROFILES_KEY, {
      profiles: [
        {
          id: 'profile_legacy',
          name: '旧配置',
          url: 'https://ollama.com/v1/chat/completions',
          apiKey: '',
          model: 'test-model',
          headers: {},
          extraParams: {},
          runtime: { concurrency: 2, timeoutMs: 30_000, retryCount: 1 },
        },
      ],
      defaultProfileId: 'profile_legacy',
    });

    const profiles = new StoredTranslationProfiles(storage);
    const [profile] = await profiles.list();
    expect(profile?.requestFormat).toBe('chat-completions');
  });

  it('保存不认识的请求方式会报错', () => {
    const draft = createProfileDraft({
      name: '配置',
      url: 'https://api.example.com/v1',
      model: 'test-model',
      requestFormat: 'anthropic-messages' as never,
    });

    expect(validateProfileDraft(draft)).toContainEqual({
      field: 'requestFormat',
      message: expect.stringContaining('请求方式'),
    });
  });

  it('表单往返保留请求方式', () => {
    const form = toFormValues();
    expect(form.requestFormat).toBe('chat-completions');

    const result = toDraft({
      ...form,
      name: '配置',
      url: 'https://api.example.com/v1',
      model: 'test-model',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.draft.requestFormat).toBe('chat-completions');
  });
});

describe('请求使用补全后的地址', () => {
  it('只填基础地址也能发出完整端点请求', () => {
    const request = buildChatCompletionRequest({
      profile: createProfileDraft({ url: 'https://ollama.com/v1', model: 'test-model' }),
      prompt: 'system',
      units,
    });

    expect(request.url).toBe('https://ollama.com/v1/chat/completions');
  });

  it('测试连接也走补全后的地址', async () => {
    const http = createMockHttpAdapter(() =>
      completionOutcome('{"translations":[{"id":"unit_connection_test","text":"敏捷的棕色狐狸跃过懒狗。"}]}'),
    );

    const result = await runConnectionTest({
      profile: createProfileDraft({ url: 'https://ollama.com/v1', model: 'test-model' }),
      prompt: 'system',
      http,
    });

    expect(result.ok).toBe(true);
    expect(http.requests[0]?.url).toBe('https://ollama.com/v1/chat/completions');
  });
});

describe('地址补全不改变协议校验', () => {
  it('只补路径不改协议：非法协议仍被保存校验拦下', () => {
    const draft = createProfileDraft({ name: '配置', url: 'ftp://example.com/v1', model: 'test-model' });

    expect(validateProfileDraft(draft)).toContainEqual({
      field: 'url',
      message: expect.stringContaining('HTTPS'),
    });
  });
});
