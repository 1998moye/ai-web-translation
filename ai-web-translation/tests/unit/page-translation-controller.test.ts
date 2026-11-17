import { afterEach, describe, expect, it } from 'vitest';
import { PageTranslationController } from '@/modules/page-translation/page-translation-controller';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { StoredSitePreferences } from '@/modules/site-preferences/site-preferences';
import { FakeTranslationEngine } from '@/modules/translation-fake/fake-translation-engine';
import { createFakeProfileCatalog } from '@/modules/translation-fake/fake-profile-catalog';
import { setPage, waitFor } from './helpers/dom';

const controllers: PageTranslationController[] = [];

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
});

interface HarnessOptions {
  storage?: MemoryKeyValueStorage;
  hostname?: string;
  engine?: FakeTranslationEngine;
  catalog?: ReturnType<typeof createFakeProfileCatalog>;
}

function createHarness(options: HarnessOptions = {}) {
  const storage = options.storage ?? new MemoryKeyValueStorage();
  const preferences = new StoredSitePreferences(storage);
  const engine = options.engine ?? new FakeTranslationEngine();
  const catalog = options.catalog ?? createFakeProfileCatalog();
  const openedSettings: string[] = [];

  const controller = new PageTranslationController({
    engine,
    profiles: catalog,
    preferences,
    hostname: options.hostname ?? 'docs.example.com',
    isFakeEngine: true,
    openSettings: () => openedSettings.push('settings'),
    mutationDebounceMs: 5,
  });
  controllers.push(controller);

  return { controller, storage, preferences, engine, catalog, openedSettings };
}

const ENGLISH_PAGE =
  '<main><p>The quick brown fox jumps over the lazy dog.</p><p>Another English sentence about the project.</p></main>';

describe('PageTranslationController 悬浮按钮与状态', () => {
  it('默认显示悬浮按钮，并暴露公开状态', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness();

    await harness.controller.mount();
    const snapshot = harness.controller.getSnapshot();

    expect(snapshot.buttonVisible).toBe(true);
    expect(snapshot.phase).toBe('idle');
    expect(snapshot.glyph).toBe('译');
    expect(snapshot.fakeEngine).toBe(true);
    expect(snapshot.backgroundConnected).toBeNull();

    harness.controller.setBackgroundConnected(true);
    expect(harness.controller.getSnapshot().backgroundConnected).toBe(true);
  });

  it('点击翻译后进入已完成状态，再点击恢复原文', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness();

    await harness.controller.mount();
    await harness.controller.togglePageTranslation();
    await waitFor(() => harness.controller.getSnapshot().phase === 'completed');

    expect(harness.controller.getSnapshot().glyph).toBe('原');
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(2);
    expect(harness.engine.requests).toHaveLength(1);

    await harness.controller.togglePageTranslation();
    expect(harness.controller.getSnapshot().phase).toBe('idle');
    expect(document.querySelectorAll('[data-aiwt]')).toHaveLength(0);
  });

  it('关闭一次只影响当前页面，不写入持久偏好', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness();

    await harness.controller.mount();
    harness.controller.dismissOnce();

    expect(harness.controller.getSnapshot().buttonVisible).toBe(false);
    expect(await harness.storage.read('aiwt.sitePreferences')).toBeUndefined();

    const reopened = createHarness({ storage: harness.storage });
    await reopened.controller.mount();
    expect(reopened.controller.getSnapshot().buttonVisible).toBe(true);
  });

  it('永久关闭按完整域名保存，不影响同主域其他子域', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness({ hostname: 'docs.example.com' });
    await harness.controller.mount();

    await harness.controller.disableButtonForSite();
    expect(harness.controller.getSnapshot().buttonVisible).toBe(false);

    const otherSubdomain = createHarness({ storage: harness.storage, hostname: 'blog.example.com' });
    await otherSubdomain.controller.mount();
    expect(otherSubdomain.controller.getSnapshot().buttonVisible).toBe(true);

    const sameHost = createHarness({ storage: harness.storage, hostname: 'docs.example.com' });
    await sameHost.controller.mount();
    expect(sameHost.controller.getSnapshot().buttonVisible).toBe(false);
  });

  it('设置入口打开扩展设置页', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness();
    await harness.controller.mount();

    harness.controller.openSettings();
    expect(harness.openedSettings).toEqual(['settings']);
  });
});

describe('PageTranslationController 自动翻译', () => {
  it('为网站开启自动翻译后，英文页面自动开始翻译', async () => {
    setPage(ENGLISH_PAGE);
    const storage = new MemoryKeyValueStorage();
    const preferences = new StoredSitePreferences(storage);
    await preferences.setAutoTranslate('news.example.com', true);

    const harness = createHarness({ storage, hostname: 'news.example.com' });
    await harness.controller.mount();

    await waitFor(() => harness.controller.getSnapshot().phase === 'completed');
    expect(harness.controller.getSnapshot().autoTranslateEnabled).toBe(true);
    expect(harness.engine.requests.length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(2);
  });

  it('非英文页面不自动翻译', async () => {
    setPage(
      '<main><p>Le chat est noir et les chiens sont grands.</p><p>Une maison avec un jardin pour les enfants.</p></main>',
    );
    const storage = new MemoryKeyValueStorage();
    await new StoredSitePreferences(storage).setAutoTranslate('news.example.com', true);

    const harness = createHarness({ storage, hostname: 'news.example.com' });
    await harness.controller.mount();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(harness.engine.requests).toHaveLength(0);
    expect(harness.controller.getSnapshot().phase).toBe('idle');
  });

  it('中文页面不自动翻译', async () => {
    setPage('<main><p>这是一段中文内容。</p><p>这个页面已经全部是中文。</p></main>');
    const storage = new MemoryKeyValueStorage();
    await new StoredSitePreferences(storage).setAutoTranslate('news.example.com', true);

    const harness = createHarness({ storage, hostname: 'news.example.com' });
    await harness.controller.mount();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(harness.engine.requests).toHaveLength(0);
  });

  it('恢复原文后同一次页面停留不会立刻再次自动翻译', async () => {
    setPage(ENGLISH_PAGE);
    const storage = new MemoryKeyValueStorage();
    await new StoredSitePreferences(storage).setAutoTranslate('news.example.com', true);

    const harness = createHarness({ storage, hostname: 'news.example.com' });
    await harness.controller.mount();
    await waitFor(() => harness.controller.getSnapshot().phase === 'completed');

    const requestCount = harness.engine.requests.length;
    harness.controller.restorePage();
    expect(harness.controller.getSnapshot().phase).toBe('idle');

    const paragraph = document.createElement('p');
    paragraph.textContent = 'More English content added after restore.';
    document.body.append(paragraph);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(harness.engine.requests).toHaveLength(requestCount);
  });

  it('可以从悬浮按钮为当前网站开启或关闭自动翻译', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness();
    await harness.controller.mount();

    expect(harness.controller.getSnapshot().autoTranslateEnabled).toBe(false);

    await harness.controller.setAutoTranslate(true);
    expect(harness.controller.getSnapshot().autoTranslateEnabled).toBe(true);
    expect((await harness.preferences.read()).autoTranslateHosts).toEqual(['docs.example.com']);

    await harness.controller.setAutoTranslate(false);
    expect((await harness.preferences.read()).autoTranslateHosts).toEqual([]);
  });

  it('永久关闭悬浮按钮不等于禁用自动翻译', async () => {
    setPage(ENGLISH_PAGE);
    const storage = new MemoryKeyValueStorage();
    const preferences = new StoredSitePreferences(storage);
    await preferences.disableButtonForSite('docs.example.com');
    await preferences.setAutoTranslate('docs.example.com', true);

    const harness = createHarness({ storage, hostname: 'docs.example.com' });
    await harness.controller.mount();

    await waitFor(() => harness.controller.getSnapshot().phase === 'completed');
    expect(harness.controller.getSnapshot().buttonVisible).toBe(false);
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(2);
  });
});

describe('PageTranslationController 重新翻译与失败提示', () => {
  it('重新翻译创建新会话并使用最新默认配置', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness();

    await harness.controller.mount();
    await harness.controller.togglePageTranslation();
    await waitFor(() => harness.controller.getSnapshot().phase === 'completed');
    expect(harness.engine.requests[0]?.profileId).toBe('fake-default');

    harness.catalog.setDefaultProfile('fake-alternate');
    await harness.controller.retranslate();

    await waitFor(() => harness.controller.getSnapshot().phase === 'completed');
    expect(harness.engine.requests.at(-1)?.profileId).toBe('fake-alternate');
    expect(harness.engine.requests.some((request) => request.profileId === 'fake-alternate')).toBe(true);
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(2);
  });

  it('重新翻译后旧会话的迟到事件不影响新会话', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness({ engine: new FakeTranslationEngine({ defaultDelayMs: 60 }) });

    await harness.controller.mount();
    await harness.controller.togglePageTranslation();
    await waitFor(() => harness.controller.getSnapshot().phase === 'translating');

    await harness.controller.retranslate();
    await waitFor(() => harness.controller.getSnapshot().phase === 'completed');
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(2);

    // 旧会话迟到的译文不会新增或覆盖新会话结果
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-aiwt="failure"]')).toHaveLength(0);
  });

  it('没有可用配置时给出提示且不伪造译文', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness({ catalog: createFakeProfileCatalog([]) });

    await harness.controller.mount();
    await harness.controller.togglePageTranslation();

    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.notice).toContain('翻译服务配置');
    expect(snapshot.phase).toBe('idle');
    expect(harness.engine.requests).toHaveLength(0);
    expect(document.querySelectorAll('[data-aiwt]')).toHaveLength(0);
  });

  it('取消翻译后按钮回到可恢复状态', async () => {
    setPage(ENGLISH_PAGE);
    const harness = createHarness({ engine: new FakeTranslationEngine({ defaultDelayMs: 50 }) });

    await harness.controller.mount();
    await harness.controller.togglePageTranslation();
    harness.controller.cancelTranslation();

    await waitFor(() => harness.controller.getSnapshot().phase === 'cancelled');
    expect(harness.controller.getSnapshot().canRetranslate).toBe(true);
  });
});
