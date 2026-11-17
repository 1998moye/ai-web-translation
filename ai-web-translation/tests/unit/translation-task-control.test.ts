import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { ChatCompletionsTranslationEngine } from '@/modules/translation-engine/chat-completions-engine';
import type { TranslationEvent, TranslationUnit } from '@/modules/translation-contract/types';
import { createProfileDraft, type TranslationProfile } from '@/modules/translation-profile/profile';
import { STORED_PROFILES_KEY, StoredTranslationProfiles } from '@/modules/translation-profile/profile-store';
import { StoredTranslationPrompt } from '@/modules/translation-prompt/prompt-store';
import { StoredTranslationCache } from '@/modules/translation-cache/translation-cache';
import type { HttpAdapter, HttpOutcome, HttpRequest } from '@/modules/translation-chat-completions/http-adapter';
import { createMockHttpAdapter, completionOutcome, textOutcome } from './helpers/mock-http';

const BASE_TEXT = 'A sentence that needs to be translated into Chinese.';

function units(count: number): TranslationUnit[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `unit_${index}`,
    kind: 'body' as const,
    text: `${BASE_TEXT} #${index}`,
  }));
}

function readUnitsFromBody(body: string): { id: string; text: string }[] {
  const parsed = JSON.parse(body) as { messages: { role: string; content: string }[] };
  const user = parsed.messages.find((message) => message.role === 'user');
  return (JSON.parse(user?.content ?? '{}') as { units: { id: string; text: string }[] }).units;
}

function successOutcome(request: HttpRequest): HttpOutcome {
  return completionOutcome(
    JSON.stringify({
      translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: `译：${unit.text}` })),
    }),
  );
}

async function setup(options: {
  runtime?: Partial<TranslationProfile['runtime']>;
  rawTimeoutMs?: number;
} = {}) {
  const storage = new MemoryKeyValueStorage();
  const profiles = new StoredTranslationProfiles(storage);
  const prompts = new StoredTranslationPrompt(storage);
  const cache = new StoredTranslationCache(storage);

  const profile = await profiles.create(
    createProfileDraft({
      name: '主力服务',
      url: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-test-secret',
      model: 'gpt-4o-mini',
      ...(options.runtime ? { runtime: { concurrency: 3, timeoutMs: 60_000, retryCount: 2, ...options.runtime } } : {}),
    }),
  );

  if (options.rawTimeoutMs !== undefined) {
    // 绕过产品级超时下限，直接写入很短的超时用于验证中止行为。
    const raw: TranslationProfile = {
      ...profile,
      runtime: { ...profile.runtime, timeoutMs: options.rawTimeoutMs, retryCount: 0 },
    };
    await storage.write(STORED_PROFILES_KEY, { profiles: [raw], defaultProfileId: raw.id });
  }

  return { storage, profiles, prompts, cache, profile };
}

async function collect(
  engine: ChatCompletionsTranslationEngine,
  request: {
    sessionId: string;
    requestId: string;
    profileId: string;
    units: TranslationUnit[];
  },
): Promise<TranslationEvent[]> {
  const events: TranslationEvent[] = [];
  for await (const event of engine.translate(request)) events.push(event);
  return events;
}

function succeededIds(events: TranslationEvent[]): string[] {
  return events.filter((event) => event.type === 'unit-succeeded').map((event) => event.unitId);
}

function failures(events: TranslationEvent[]) {
  return events.filter((event) => event.type === 'unit-failed');
}

describe('ChatCompletionsTranslationEngine：并发', () => {
  it('同时请求数不超过配置的并发数', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { concurrency: 2 } });
    let inFlight = 0;
    let peak = 0;

    const http: HttpAdapter = createMockHttpAdapter(async (request) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return successOutcome(request);
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(20),
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(succeededIds(events)).toHaveLength(20);
  });

  it('并发为 1 时批次串行执行', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { concurrency: 1 } });
    let peak = 0;
    let inFlight = 0;

    const http: HttpAdapter = createMockHttpAdapter(async (request) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return successOutcome(request);
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(20),
    });

    expect(peak).toBe(1);
  });

  it('缓存命中不占用并发', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { concurrency: 1 } });
    let calls = 0;
    const http = createMockHttpAdapter((request) => {
      calls += 1;
      return successOutcome(request);
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, { sessionId: 'ses_1', requestId: 'req_1', profileId: profile.id, units: units(2) });
    calls = 0;
    await collect(engine, { sessionId: 'ses_2', requestId: 'req_2', profileId: profile.id, units: units(2) });

    expect(calls).toBe(0);
  });
});

describe('ChatCompletionsTranslationEngine：超时与取消', () => {
  it('请求超过配置超时会中止并给出脱敏超时错误', async () => {
    const { profiles, prompts, cache, profile } = await setup({ rawTimeoutMs: 40 });

    const http: HttpAdapter = createMockHttpAdapter(
      (request) =>
        new Promise<HttpOutcome>((resolve) => {
          request.signal?.addEventListener('abort', () => resolve({ ok: false, reason: 'timeout' }), {
            once: true,
          });
        }),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    const failure = failures(events)[0];
    expect(failure && 'error' in failure ? failure.error.code : '').toBe('timeout');
    expect(failure && 'error' in failure ? failure.error.message : '').not.toContain('sk-test-secret');
  });

  it('取消会话会中止进行中的请求，之后不再返回该会话的译文', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    let aborted = false;

    const http: HttpAdapter = createMockHttpAdapter(
      (request) =>
        new Promise<HttpOutcome>((resolve) => {
          request.signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              resolve({ ok: false, reason: 'aborted' });
            },
            { once: true },
          );
        }),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const pending = collect(engine, {
      sessionId: 'ses_cancel',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(2),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    await engine.cancelSession('ses_cancel');
    const events = await pending;

    expect(aborted).toBe(true);
    expect(succeededIds(events)).toHaveLength(0);
    expect(failures(events)).toHaveLength(0);
    expect(await cache.count()).toBe(0);
  });

  it('取消会话后清除配置快照，新请求重新解析配置', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) => successOutcome(request));
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, { sessionId: 'ses_x', requestId: 'req_1', profileId: profile.id, units: units(1) });
    await engine.cancelSession('ses_x');

    await profiles.update(profile.id, { ...profile, model: 'gpt-4.1' });
    await collect(engine, {
      sessionId: 'ses_x',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(2).slice(1),
    });

    const models = http.requests.map((request) => (JSON.parse(request.body) as { model: string }).model);
    expect(models).toEqual(['gpt-4o-mini', 'gpt-4.1']);
  });
});

describe('ChatCompletionsTranslationEngine：自动重试', () => {
  it('网络错误按配置次数重试后进入失败状态', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { retryCount: 2 } });
    const delays: number[] = [];
    const http = createMockHttpAdapter({ ok: false, reason: 'network' });
    const engine = new ChatCompletionsTranslationEngine({
      http,
      profiles,
      prompts,
      cache,
      sleep: async (ms) => void delays.push(ms),
    });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    expect(http.requests).toHaveLength(3);
    expect(delays).toHaveLength(2);
    const failure = failures(events)[0];
    expect(failure && 'error' in failure ? failure.error.code : '').toBe('network');
  });

  it('429 尊重服务返回的等待时间', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { retryCount: 1 } });
    const delays: number[] = [];
    const http = createMockHttpAdapter(textOutcome('', 429, { 'retry-after': '7' }));
    const engine = new ChatCompletionsTranslationEngine({
      http,
      profiles,
      prompts,
      cache,
      sleep: async (ms) => void delays.push(ms),
    });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    expect(delays).toEqual([7000]);
    expect(http.requests).toHaveLength(2);
  });

  it('5xx 重试后成功时返回译文', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { retryCount: 2 } });
    let call = 0;
    const http = createMockHttpAdapter((request) => {
      call += 1;
      return call === 1 ? textOutcome('', 503) : successOutcome(request);
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache, sleep: async () => {} });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    expect(http.requests).toHaveLength(2);
    expect(succeededIds(events)).toEqual(['unit_0']);
  });

  it('400、401 与 403 不自动重试', async () => {
    for (const status of [400, 401, 403]) {
      const { profiles, prompts, cache, profile } = await setup({ runtime: { retryCount: 3 } });
      const http = createMockHttpAdapter(textOutcome('{"error":"no"}', status));
      const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache, sleep: async () => {} });

      const events = await collect(engine, {
        sessionId: 'ses_1',
        requestId: 'req_1',
        profileId: profile.id,
        units: units(1),
      });

      expect(http.requests).toHaveLength(1);
      const failure = failures(events)[0];
      expect(failure && 'error' in failure ? failure.error.code : '').toBe(status === 400 ? 'request-invalid' : 'auth');
    }
  });

  it('重试次数为 0 时只请求一次', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { retryCount: 0 } });
    const http = createMockHttpAdapter({ ok: false, reason: 'network' });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache, sleep: async () => {} });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    expect(http.requests).toHaveLength(1);
  });

  it('重试上限后部分成功结果仍然可用，失败内容可以重新提交', async () => {
    const { profiles, prompts, cache, profile } = await setup({ runtime: { retryCount: 0 } });
    let call = 0;
    const http = createMockHttpAdapter((request) => {
      call += 1;
      // 第一次请求的第一批失败，第二批成功；之后全部成功。
      if (call === 1) return textOutcome('', 500);
      return successOutcome(request);
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache, sleep: async () => {} });

    const first = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(10),
    });

    expect(failures(first)).toHaveLength(8);
    expect(succeededIds(first)).toHaveLength(2);
    const callsAfterFirst = call;

    const retryRequest = {
      sessionId: 'ses_1',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(10).slice(0, 8),
    };
    const second = await collect(engine, retryRequest);

    // 重新提交只请求失败的那一批；已成功的两段命中缓存不重复请求。
    expect(failures(second)).toHaveLength(0);
    expect(call).toBe(callsAfterFirst + 1);
  });
});
