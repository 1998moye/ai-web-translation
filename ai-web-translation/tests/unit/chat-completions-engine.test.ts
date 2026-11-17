import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { StoredTranslationCache } from '@/modules/translation-cache/translation-cache';
import { ChatCompletionsTranslationEngine } from '@/modules/translation-engine/chat-completions-engine';
import type { TranslationEvent, TranslationUnit } from '@/modules/translation-contract/types';
import { createProfileDraft } from '@/modules/translation-profile/profile';
import { StoredTranslationProfiles } from '@/modules/translation-profile/profile-store';
import { StoredTranslationPrompt } from '@/modules/translation-prompt/prompt-store';
import { createMockHttpAdapter, completionOutcome, textOutcome } from './helpers/mock-http';

const UNITS_TEXT = 'The quick brown fox jumps over the lazy dog.';

function units(count: number, text?: string): TranslationUnit[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `unit_${index}`,
    kind: 'body' as const,
    text: text ?? `${UNITS_TEXT} #${index}`,
  }));
}

function readUnitsFromBody(body: string): { id: string; text: string }[] {
  const parsed = JSON.parse(body) as { messages: { role: string; content: string }[] };
  const user = parsed.messages.find((message) => message.role === 'user');
  return (JSON.parse(user?.content ?? '{}') as { units: { id: string; text: string }[] }).units;
}

async function setup() {
  const storage = new MemoryKeyValueStorage();
  const profiles = new StoredTranslationProfiles(storage);
  const prompts = new StoredTranslationPrompt(storage);
  const cache = new StoredTranslationCache(storage);
  const profile = await profiles.create(
    createProfileDraft({
      name: '主力服务',
      url: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    }),
  );

  return { storage, profiles, prompts, cache, profile };
}

async function collect(engine: ChatCompletionsTranslationEngine, request: {
  sessionId: string;
  requestId: string;
  profileId: string;
  units: TranslationUnit[];
  context?: { pageTitle?: string; sectionTitle?: string; previousText?: string };
}): Promise<TranslationEvent[]> {
  const events: TranslationEvent[] = [];
  for await (const event of engine.translate(request)) events.push(event);
  return events;
}

function succeededIds(events: TranslationEvent[]): string[] {
  return events.filter((event) => event.type === 'unit-succeeded').map((event) => event.unitId);
}

function failedIds(events: TranslationEvent[]): string[] {
  return events.filter((event) => event.type === 'unit-failed').map((event) => event.unitId);
}

describe('ChatCompletionsTranslationEngine：分批', () => {
  it('长单元列表拆成多个批次请求，每批只带自己的单元', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) =>
      completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: `译：${unit.text}` })),
        }),
      ),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(10),
    });

    expect(http.requests).toHaveLength(2);
    expect(http.requests.map((request) => readUnitsFromBody(request.body).length).sort()).toEqual([2, 8]);
    // 批次并发完成，事件顺序不保证；调用方按单元 ID 对应原文。
    expect(succeededIds(events).sort()).toEqual(units(10).map((unit) => unit.id).sort());
  });

  it('同一会话的多个批次使用相同配置与提示词', async () => {
    await setup().then(async ({ profiles, prompts, cache, profile }) => {
      await prompts.save('自定义提示词');
      const http = createMockHttpAdapter((request) =>
        completionOutcome(
          JSON.stringify({
            translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: `译：${unit.text}` })),
          }),
        ),
      );
      const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

      await collect(engine, {
        sessionId: 'ses_1',
        requestId: 'req_1',
        profileId: profile.id,
        units: units(10),
      });

      const bodies = http.requests.map((request) => JSON.parse(request.body) as {
        model: string;
        messages: { role: string; content: string }[];
      });
      expect(bodies.map((body) => body.model)).toEqual(['gpt-4o-mini', 'gpt-4o-mini']);
      expect(bodies.map((body) => body.messages[0]?.content)).toEqual(['自定义提示词', '自定义提示词']);
    });
  });

  it('某一批失败不影响其他批次的成功结果', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    let call = 0;
    const http = createMockHttpAdapter((request) => {
      call += 1;
      if (call === 1) return textOutcome('{"error":"bad model"}', 400);
      return completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: `译：${unit.text}` })),
        }),
      );
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(10),
    });

    expect(failedIds(events)).toHaveLength(8);
    expect(succeededIds(events)).toHaveLength(2);
    expect(events.at(-1)?.type).toBe('request-completed');

    const failure = events.find((event) => event.type === 'unit-failed');
    expect(failure && 'error' in failure ? failure.error.code : '').toBe('request-invalid');
  });
});

describe('ChatCompletionsTranslationEngine：单元 ID 校验', () => {
  it('响应缺失的单元标记为失败，其他单元正常返回', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) => {
      const received = readUnitsFromBody(request.body);
      return completionOutcome(
        JSON.stringify({
          translations: received
            .filter((unit) => unit.id !== 'unit_1')
            .map((unit) => ({ id: unit.id, text: `译：${unit.text}` })),
        }),
      );
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(2),
    });

    expect(succeededIds(events)).toEqual(['unit_0']);
    expect(failedIds(events)).toEqual(['unit_1']);
  });

  it('重复与未知的单元 ID 不被猜测性渲染', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) => {
      const received = readUnitsFromBody(request.body);
      return completionOutcome(
        JSON.stringify({
          translations: [
            { id: received[0]!.id, text: '译文甲' },
            { id: received[0]!.id, text: '译文乙' },
            { id: 'unit_unknown', text: '未知单元' },
            { id: received[1]!.id, text: '正常的译文' },
          ],
        }),
      );
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(2),
    });

    expect(failedIds(events)).toEqual(['unit_0']);
    expect(succeededIds(events)).toEqual(['unit_1']);
    const succeeded = events.find((event) => event.type === 'unit-succeeded');
    expect(succeeded && 'text' in succeeded ? succeeded.text : '').toBe('正常的译文');
  });

  it('响应无法解析时该批次单元整体失败', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter(completionOutcome('好的，译文如下：你好。'));
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(3),
    });

    expect(failedIds(events)).toHaveLength(3);
    const failure = events.find((event) => event.type === 'unit-failed');
    expect(failure && 'error' in failure ? failure.error.code : '').toBe('response-invalid');
  });
});

describe('ChatCompletionsTranslationEngine：翻译上下文', () => {
  it('上下文随请求发送，但只作为上下文不要求译文', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) =>
      completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: `译：${unit.text}` })),
        }),
      ),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const events = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(2),
      context: { pageTitle: 'Example Domain', sectionTitle: 'Overview', previousText: 'Earlier paragraph.' },
    });

    const body = JSON.parse(http.requests[0]!.body) as {
      messages: { role: string; content: string }[];
    };
    const payload = JSON.parse(body.messages[1]!.content) as {
      units: { id: string }[];
      context: Record<string, string>;
    };

    expect(payload.context).toEqual({
      pageTitle: 'Example Domain',
      sectionTitle: 'Overview',
      previousText: 'Earlier paragraph.',
    });
    expect(payload.units.map((unit) => unit.id)).not.toContain('context');
    expect(succeededIds(events)).toEqual(['unit_0', 'unit_1']);
  });

  it('没有上下文时不发送 context 字段', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) =>
      completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: `译：${unit.text}` })),
        }),
      ),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    const body = JSON.parse(http.requests[0]!.body) as { messages: { content: string }[] };
    expect(JSON.parse(body.messages[1]!.content)).not.toHaveProperty('context');
  });
});


describe('ChatCompletionsTranslationEngine：译文缓存', () => {
  it('命中缓存的单元不产生翻译服务请求', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    let calls = 0;
    const http = createMockHttpAdapter((request) => {
      calls += 1;
      return completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: '缓存的译文' })),
        }),
      );
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const first = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(2),
    });
    const second = await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(2),
    });

    expect(calls).toBe(1);
    expect(succeededIds(first)).toEqual(['unit_0', 'unit_1']);
    expect(succeededIds(second)).toEqual(['unit_0', 'unit_1']);
  });

  it('失败批次与缺失单元的译文不会写入缓存', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    let calls = 0;
    const http = createMockHttpAdapter((request) => {
      calls += 1;
      if (calls === 1) return textOutcome('{"error":"bad request"}', 400);
      const received = readUnitsFromBody(request.body);
      return completionOutcome(
        JSON.stringify({
          // 第二次请求故意只返回第二个单元的译文。
          translations: received.filter((unit) => unit.id === 'unit_1').map((unit) => ({ id: unit.id, text: '成功译文' })),
        }),
      );
    });
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(2),
    });
    expect(await cache.count()).toBe(0);

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(2),
    });
    expect(await cache.count()).toBe(1);
    expect(calls).toBe(2);
  });

  it('响应无法解析时不写入缓存', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter(completionOutcome('好的，译文如下。'));
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    expect(await cache.count()).toBe(0);
  });

  it('配置变化后相同原文不会命中旧缓存', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) =>
      completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: '译文' })),
        }),
      ),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    await profiles.update(profile.id, { ...profile, model: 'gpt-4.1' });

    await collect(engine, {
      sessionId: 'ses_2',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(1),
    });

    expect(http.requests).toHaveLength(2);
    const bodies = http.requests.map((request) => JSON.parse(request.body) as { model: string });
    expect(bodies.map((body) => body.model)).toEqual(['gpt-4o-mini', 'gpt-4.1']);
  });

  it('提示词变化后相同原文会重新请求', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) =>
      completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: '译文' })),
        }),
      ),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });

    await prompts.save('调整过的提示词');

    await collect(engine, {
      sessionId: 'ses_2',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(1),
    });

    expect(http.requests).toHaveLength(2);
  });

  it('取消中的请求不会写入缓存', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter(
      async (request) =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                completionOutcome(
                  JSON.stringify({
                    translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: '迟到译文' })),
                  }),
                ),
              ),
            20,
          );
        }),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    const pending = collect(engine, {
      sessionId: 'ses_1',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1),
    });
    await engine.cancelSession('ses_1');
    const events = await pending;

    expect(events.filter((event) => event.type === 'unit-succeeded')).toHaveLength(0);
    expect(await cache.count()).toBe(0);
  });
});

describe('ChatCompletionsTranslationEngine：会话配置快照', () => {
  it('首次请求固定配置，会话内后续批次沿用旧配置', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) =>
      completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: '译文' })),
        }),
      ),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_keep',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1, 'First sentence for this session.'),
    });

    await profiles.update(profile.id, { ...profile, model: 'gpt-4.1' });

    await collect(engine, {
      sessionId: 'ses_keep',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(1, 'Second sentence in the same session.'),
    });

    await collect(engine, {
      sessionId: 'ses_new',
      requestId: 'req_3',
      profileId: profile.id,
      units: units(1, 'A sentence from a fresh session.'),
    });

    const models = http.requests.map((request) => (JSON.parse(request.body) as { model: string }).model);
    expect(models).toEqual(['gpt-4o-mini', 'gpt-4o-mini', 'gpt-4.1']);
  });

  it('会话内提示词修改不影响已开始的会话', async () => {
    const { profiles, prompts, cache, profile } = await setup();
    const http = createMockHttpAdapter((request) =>
      completionOutcome(
        JSON.stringify({
          translations: readUnitsFromBody(request.body).map((unit) => ({ id: unit.id, text: '译文' })),
        }),
      ),
    );
    const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });

    await collect(engine, {
      sessionId: 'ses_keep',
      requestId: 'req_1',
      profileId: profile.id,
      units: units(1, 'First sentence for this session.'),
    });
    await prompts.save('新的提示词');

    await collect(engine, {
      sessionId: 'ses_keep',
      requestId: 'req_2',
      profileId: profile.id,
      units: units(1, 'Second sentence in the same session.'),
    });

    const promptsUsed = http.requests.map(
      (request) => (JSON.parse(request.body) as { messages: { content: string }[] }).messages[0]?.content,
    );
    expect(promptsUsed[0]).toBe(promptsUsed[1]);
    expect(promptsUsed[0]).not.toBe('新的提示词');
  });
});
