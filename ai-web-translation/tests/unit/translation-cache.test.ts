import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { SITE_PREFERENCES_KEY } from '@/modules/site-preferences/site-preferences';
import {
  StoredTranslationCache,
  TRANSLATION_CACHE_KEY,
} from '@/modules/translation-cache/translation-cache';
import type { TranslationCacheDescriptor } from '@/modules/translation-cache/cache-key';
import { STORED_PROFILES_KEY } from '@/modules/translation-profile/profile-store';

const DESCRIPTOR: TranslationCacheDescriptor = {
  sourceText: 'The quick brown fox jumps over the lazy dog.',
  sourceLanguage: 'en',
  targetLanguage: 'zh-CN',
  serviceUrl: 'https://api.example.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  prompt: '把英文翻译成简体中文。',
  extraParams: { reasoning_effort: 'none' },
};

function descriptor(overrides: Partial<TranslationCacheDescriptor> = {}): TranslationCacheDescriptor {
  return { ...DESCRIPTOR, ...overrides };
}

describe('StoredTranslationCache', () => {
  it('保存并复用成功译文', async () => {
    const cache = new StoredTranslationCache(new MemoryKeyValueStorage());
    await cache.put(descriptor(), '敏捷的棕色狐狸跳过了懒狗。');

    expect(await cache.get(descriptor())).toBe('敏捷的棕色狐狸跳过了懒狗。');
  });

  it('未命中时返回 null', async () => {
    const cache = new StoredTranslationCache(new MemoryKeyValueStorage());

    expect(await cache.get(descriptor())).toBeNull();
    expect(
      await cache.get(descriptor({ sourceText: 'A different source sentence that was never translated.' })),
    ).toBeNull();
  });

  it('扩展重新加载后缓存仍然可用', async () => {
    const storage = new MemoryKeyValueStorage();
    await new StoredTranslationCache(storage).put(descriptor(), '译文');

    const reloaded = new StoredTranslationCache(storage);
    expect(await reloaded.get(descriptor())).toBe('译文');
    expect(await reloaded.count()).toBe(1);
  });

  it('不同配置不会混用译文', async () => {
    const cache = new StoredTranslationCache(new MemoryKeyValueStorage());
    await cache.put(descriptor({ model: 'gpt-4o-mini' }), '小模型的译文');
    await cache.put(descriptor({ model: 'gpt-4.1' }), '大模型的译文');

    expect(await cache.get(descriptor({ model: 'gpt-4o-mini' }))).toBe('小模型的译文');
    expect(await cache.get(descriptor({ model: 'gpt-4.1' }))).toBe('大模型的译文');
    expect(await cache.get(descriptor({ model: 'other-model' }))).toBeNull();
  });

  it('清空缓存不影响配置与网站偏好', async () => {
    const storage = new MemoryKeyValueStorage();
    const cache = new StoredTranslationCache(storage);
    await cache.put(descriptor(), '译文');
    await storage.write(STORED_PROFILES_KEY, { profiles: [], defaultProfileId: null });
    await storage.write(SITE_PREFERENCES_KEY, {
      disabledButtonHosts: ['docs.example.com'],
      autoTranslateHosts: ['news.example.com'],
    });

    await cache.clear();

    expect(await cache.get(descriptor())).toBeNull();
    expect(await cache.count()).toBe(0);
    expect(await storage.read(STORED_PROFILES_KEY)).toEqual({ profiles: [], defaultProfileId: null });
    expect(await storage.read(SITE_PREFERENCES_KEY)).toEqual({
      disabledButtonHosts: ['docs.example.com'],
      autoTranslateHosts: ['news.example.com'],
    });
  });

  it('清空缓存后同一原文会重新成为未命中', async () => {
    const cache = new StoredTranslationCache(new MemoryKeyValueStorage());
    await cache.put(descriptor(), '译文');
    await cache.clear();

    expect(await cache.get(descriptor())).toBeNull();
  });

  it('损坏的缓存数据被忽略', async () => {
    const storage = new MemoryKeyValueStorage();
    await storage.write(TRANSLATION_CACHE_KEY, 'not-an-object');

    const cache = new StoredTranslationCache(storage);
    expect(await cache.get(descriptor())).toBeNull();
    expect(await cache.count()).toBe(0);
  });

  it('缓存超过上限时淘汰最旧的条目', async () => {
    const storage = new MemoryKeyValueStorage();
    const cache = new StoredTranslationCache(storage, { maxEntries: 2 });

    await cache.put(descriptor({ sourceText: 'First English sentence.' }), '一');
    await cache.put(descriptor({ sourceText: 'Second English sentence.' }), '二');
    await cache.put(descriptor({ sourceText: 'Third English sentence.' }), '三');

    expect(await cache.count()).toBe(2);
    expect(await cache.get(descriptor({ sourceText: 'First English sentence.' }))).toBeNull();
    expect(await cache.get(descriptor({ sourceText: 'Third English sentence.' }))).toBe('三');
  });

  it('缓存只保存成功译文，不出现空值', async () => {
    const cache = new StoredTranslationCache(new MemoryKeyValueStorage());
    await cache.put(descriptor(), '   ');
    expect(await cache.count()).toBe(0);
  });
});
