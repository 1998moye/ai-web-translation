import { describe, expect, it } from 'vitest';
import { createSanitizedError } from '@/modules/translation-contract/sanitized-error';
import type { TranslationEvent } from '@/modules/translation-contract/types';
import { FakeTranslationEngine, FAKE_TRANSLATION_PREFIX } from '@/modules/translation-fake/fake-translation-engine';
import { createFakeProfileCatalog } from '@/modules/translation-fake/fake-profile-catalog';
import { createHealthResponse, isHealthRequest, isHealthResponse } from '@/modules/messaging/health';
import { createOpenOptionsRequest, isOpenOptionsRequest } from '@/modules/messaging/open-options';
import {
  createUnavailableProfileCatalog,
  createUnavailableTranslationEngine,
} from '@/modules/translation-fake/unavailable-translation';

const units = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `unit-${index}`,
    kind: 'body' as const,
    text: `Sentence number ${index}.`,
  }));

const request = {
  sessionId: 'ses-1',
  requestId: 'req-1',
  profileId: 'profile-1',
  units: units(3),
};

async function collect(stream: AsyncIterable<TranslationEvent>): Promise<TranslationEvent[]> {
  const events: TranslationEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('FakeTranslationEngine', () => {
  it('为每个单元返回带对应 ID 的译文，并在最后完成', async () => {
    const engine = new FakeTranslationEngine();
    const events = await collect(engine.translate(request));

    const succeeded = events.filter((event) => event.type === 'unit-succeeded');
    expect(succeeded).toHaveLength(3);
    expect(succeeded.map((event) => (event.type === 'unit-succeeded' ? event.unitId : ''))).toEqual([
      'unit-0',
      'unit-1',
      'unit-2',
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'request-completed', requestId: 'req-1' });
    expect(engine.requests[0]).toMatchObject({ sessionId: 'ses-1', profileId: 'profile-1' });
  });

  it('按单元延迟制造乱序返回', async () => {
    const engine = new FakeTranslationEngine({
      delayForUnit: (_unit, index) => (index === 0 ? 40 : index === 1 ? 0 : 20),
    });
    const events = await collect(engine.translate(request));
    const order = events
      .filter((event) => event.type === 'unit-succeeded')
      .map((event) => (event.type === 'unit-succeeded' ? event.unitId : ''));

    expect(order).toEqual(['unit-1', 'unit-2', 'unit-0']);
  });

  it('可以模拟部分失败', async () => {
    const failure = createSanitizedError('server', '服务端故障');
    const engine = new FakeTranslationEngine({
      translate: (unit) => (unit.id === 'unit-1' ? null : `${FAKE_TRANSLATION_PREFIX}${unit.text}`),
      failure,
    });

    const events = await collect(engine.translate(request));
    expect(events.filter((event) => event.type === 'unit-failed')).toEqual([
      expect.objectContaining({ unitId: 'unit-1', error: failure }),
    ]);
    expect(events.filter((event) => event.type === 'unit-succeeded')).toHaveLength(2);
  });

  it('取消会话后不再产生事件', async () => {
    const engine = new FakeTranslationEngine({ defaultDelayMs: 30 });
    const pending = collect(engine.translate(request));
    await engine.cancelSession('ses-1');

    const events = await pending;
    expect(events).toEqual([]);
    expect(engine.cancelledSessions.has('ses-1')).toBe(true);
  });

  it('取消后新请求不会开始翻译', async () => {
    const engine = new FakeTranslationEngine();
    await engine.cancelSession('ses-1');
    const events = await collect(engine.translate({ ...request, requestId: 'req-2' }));
    expect(events).toEqual([]);
  });
});

describe('Fake Profile Catalog', () => {
  it('只暴露配置摘要与默认配置', async () => {
    const catalog = createFakeProfileCatalog();
    const profiles = await catalog.listProfiles();
    expect(profiles.map((profile) => profile.id)).toEqual(['fake-default', 'fake-alternate']);
    expect(await catalog.getDefaultProfile()).toMatchObject({ id: 'fake-default', isDefault: true });
    expect(JSON.stringify(profiles)).not.toContain('apiKey');
  });

  it('可以模拟默认配置变化', async () => {
    const catalog = createFakeProfileCatalog();
    catalog.setDefaultProfile('fake-alternate');
    expect(await catalog.getDefaultProfile()).toMatchObject({ id: 'fake-alternate', isDefault: true });
  });

  it('没有配置时返回 null', async () => {
    const catalog = createFakeProfileCatalog([]);
    expect(await catalog.getDefaultProfile()).toBeNull();
    expect(await catalog.listProfiles()).toEqual([]);
  });
});

describe('生产占位实现', () => {
  it('不伪造译文，也不返回配置', async () => {
    const catalog = createUnavailableProfileCatalog();
    expect(await catalog.getDefaultProfile()).toBeNull();
    expect(await catalog.listProfiles()).toEqual([]);

    const engine = createUnavailableTranslationEngine();
    const events = await collect(engine.translate(request));
    expect(events.filter((event) => event.type === 'unit-succeeded')).toHaveLength(0);
    expect(events.filter((event) => event.type === 'unit-failed')).toHaveLength(3);
    expect(events.every((event) => event.type !== 'unit-succeeded')).toBe(true);
  });
});

describe('健康检查协议', () => {
  it('识别健康检查请求与响应', () => {
    expect(isHealthRequest({ type: 'aiwt:health-request' })).toBe(true);
    expect(isHealthRequest({ type: 'other' })).toBe(false);

    const response = createHealthResponse(false, '0.1.0');
    expect(response).toEqual({ ok: true, version: '0.1.0', fakeEngine: false });
    expect(isHealthResponse(response)).toBe(true);
    expect(isHealthResponse({ ok: true })).toBe(false);
  });

  it('识别打开设置页请求', () => {
    expect(isOpenOptionsRequest(createOpenOptionsRequest())).toBe(true);
    expect(isOpenOptionsRequest({ type: 'aiwt:health-request' })).toBe(false);
    expect(isOpenOptionsRequest(null)).toBe(false);
  });
});
