import { describe, expect, it, vi } from 'vitest';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import {
  normalizeHostname,
  normalizeSitePreferences,
  SITE_PREFERENCES_KEY,
  StoredSitePreferences,
} from '@/modules/site-preferences/site-preferences';

describe('SitePreferences', () => {
  it('按完整域名保存悬浮按钮停用，并在重新加载后保持', async () => {
    const storage = new MemoryKeyValueStorage();
    const preferences = new StoredSitePreferences(storage);

    await preferences.disableButtonForSite('docs.example.com');

    expect(await preferences.isButtonDisabled('docs.example.com')).toBe(true);
    expect(await preferences.isButtonDisabled('example.com')).toBe(false);
    expect(await preferences.isButtonDisabled('blog.example.com')).toBe(false);

    const reloaded = new StoredSitePreferences(storage);
    expect((await reloaded.read()).disabledButtonHosts).toEqual(['docs.example.com']);
  });

  it('移除停用记录后恢复按钮', async () => {
    const preferences = new StoredSitePreferences(new MemoryKeyValueStorage());
    await preferences.disableButtonForSite('docs.example.com');
    await preferences.enableButtonForSite('docs.example.com');
    expect(await preferences.isButtonDisabled('docs.example.com')).toBe(false);
  });

  it('自动翻译列表与悬浮按钮停用列表互不影响', async () => {
    const preferences = new StoredSitePreferences(new MemoryKeyValueStorage());

    await preferences.setAutoTranslate('news.example.com', true);
    await preferences.disableButtonForSite('news.example.com');
    await preferences.setAutoTranslate('news.example.com', false);

    const result = await preferences.read();
    expect(result.autoTranslateHosts).toEqual([]);
    expect(result.disabledButtonHosts).toEqual(['news.example.com']);
  });

  it('主机名规范化：小写、去端口、去结尾点', async () => {
    expect(normalizeHostname(' Example.COM:443 ')).toBe('example.com');
    expect(normalizeHostname('example.com.')).toBe('example.com');
    expect(await HostDisabled('docs.example.com', 'DOCS.Example.com:443')).toBe(true);
  });

  it('保留 localhost 这类无点主机名', async () => {
    const storage = new MemoryKeyValueStorage();
    const preferences = new StoredSitePreferences(storage);

    await preferences.disableButtonForSite('localhost');

    expect(await preferences.isButtonDisabled('localhost')).toBe(true);
    expect(await new StoredSitePreferences(storage).isButtonDisabled('localhost')).toBe(true);
  });

  it('损坏或非法存储数据被规范化', async () => {
    const storage = new MemoryKeyValueStorage();
    await storage.write(SITE_PREFERENCES_KEY, {
      disabledButtonHosts: ['A.example.com', 'a.example.com', 42, 'http://example.com'],
      autoTranslateHosts: 'nope',
    });

    const preferences = new StoredSitePreferences(storage);
    expect(await preferences.read()).toEqual({
      disabledButtonHosts: ['a.example.com'],
      autoTranslateHosts: [],
    });
    expect(normalizeSitePreferences(null)).toEqual({ disabledButtonHosts: [], autoTranslateHosts: [] });
  });

  it('watch 在偏好变化时通知订阅者', async () => {
    const preferences = new StoredSitePreferences(new MemoryKeyValueStorage());
    const listener = vi.fn();
    const unsubscribe = preferences.watch(listener);

    await preferences.disableButtonForSite('example.com');
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)?.[0]).toEqual({
      disabledButtonHosts: ['example.com'],
      autoTranslateHosts: [],
    });

    unsubscribe();
    await preferences.setAutoTranslate('example.com', true);
    expect(listener.mock.calls.at(-1)?.[0].autoTranslateHosts).toEqual([]);
  });
});

async function HostDisabled(savedHost: string, queryHost: string): Promise<boolean> {
  const preferences = new StoredSitePreferences(new MemoryKeyValueStorage());
  await preferences.disableButtonForSite(savedHost);
  return preferences.isButtonDisabled(queryHost);
}
