import { describe, expect, it, vi } from 'vitest';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { StoredTranslationProfileCatalog } from '@/modules/translation-profile/profile-catalog';
import {
  createProfileDraft,
  maskApiKey,
  type TranslationProfileDraft,
} from '@/modules/translation-profile/profile';
import {
  InvalidProfileError,
  STORED_PROFILES_KEY,
  StoredTranslationProfiles,
} from '@/modules/translation-profile/profile-store';

const API_KEY = 'sk-live-secret-abcd1234';

function draft(overrides: Partial<TranslationProfileDraft> = {}): TranslationProfileDraft {
  return {
    ...createProfileDraft(),
    name: '主力服务',
    url: 'https://api.example.com/v1/chat/completions',
    apiKey: API_KEY,
    model: 'gpt-4o-mini',
    ...overrides,
  };
}

describe('StoredTranslationProfiles', () => {
  it('创建多份命名配置并保存完整 URL、API Key 和模型名', async () => {
    const repository = new StoredTranslationProfiles(new MemoryKeyValueStorage());

    const first = await repository.create(draft());
    const second = await repository.create(draft({ name: '备用服务', model: 'qwen-plus' }));

    expect(first.id).not.toBe(second.id);
    expect(await repository.list()).toEqual([first, second]);
    expect(await repository.find(second.id)).toEqual(second);
  });

  it('第一份配置自动成为默认，后续配置不改变已选默认', async () => {
    const repository = new StoredTranslationProfiles(new MemoryKeyValueStorage());

    const first = await repository.create(draft());
    expect((await repository.findDefault())?.id).toBe(first.id);

    await repository.create(draft({ name: '备用服务' }));
    expect((await repository.findDefault())?.id).toBe(first.id);
  });

  it('用户可以切换默认配置，重新加载后依然保持', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new StoredTranslationProfiles(storage);
    const first = await repository.create(draft());
    const second = await repository.create(draft({ name: '备用服务' }));

    await repository.setDefault(second.id);

    const reloaded = new StoredTranslationProfiles(storage);
    expect((await reloaded.findDefault())?.id).toBe(second.id);
    expect(await reloaded.list()).toEqual([first, second]);
  });

  it('删除默认配置后不留指向不存在配置的默认选择', async () => {
    const repository = new StoredTranslationProfiles(new MemoryKeyValueStorage());
    const first = await repository.create(draft());
    const second = await repository.create(draft({ name: '备用服务' }));
    await repository.setDefault(first.id);

    await repository.remove(first.id);

    const state = await repository.read();
    expect(state.profiles.map((profile) => profile.id)).toEqual([second.id]);
    expect(state.defaultProfileId).toBe(second.id);
  });

  it('删除最后一份配置后没有默认配置，也不影响其他有效配置', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new StoredTranslationProfiles(storage);
    const only = await repository.create(draft());

    await repository.remove(only.id);

    expect(await repository.read()).toEqual({ profiles: [], defaultProfileId: null });
    const reloaded = new StoredTranslationProfiles(storage);
    expect(await reloaded.read()).toEqual({ profiles: [], defaultProfileId: null });
  });

  it('编辑配置保留稳定 ID 并写回全部字段', async () => {
    const repository = new StoredTranslationProfiles(new MemoryKeyValueStorage());
    const created = await repository.create(draft());

    const updated = await repository.update(created.id, draft({ name: '改名后', model: 'gpt-4.1' }));

    expect(updated.id).toBe(created.id);
    expect(await repository.find(created.id)).toEqual(updated);
    expect(updated.name).toBe('改名后');
    expect(updated.model).toBe('gpt-4.1');
  });

  it('拒绝把不合法的配置写入本机存储', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new StoredTranslationProfiles(storage);

    await expect(repository.create(draft({ name: '  ' }))).rejects.toBeInstanceOf(InvalidProfileError);
    await expect(repository.create(draft({ url: 'http://api.example.com/v1' }))).rejects.toBeInstanceOf(
      InvalidProfileError,
    );
    expect(await repository.list()).toEqual([]);
  });

  it('损坏的存储被规范化为可用状态', async () => {
    const storage = new MemoryKeyValueStorage();
    await storage.write(STORED_PROFILES_KEY, {
      profiles: [
        { id: 'prof_keep', name: '保留', url: 'https://a.example.com/v1', model: 'm' },
        { name: '缺少 ID 被丢弃', url: 'https://b.example.com/v1', model: 'm' },
        'nope',
      ],
      defaultProfileId: 'prof_deleted',
    });

    const repository = new StoredTranslationProfiles(storage);
    const state = await repository.read();

    expect(state.profiles.map((profile) => profile.id)).toEqual(['prof_keep']);
    expect(state.defaultProfileId).toBe('prof_keep');
    expect(state.profiles[0]?.headers).toEqual({});
    expect(state.profiles[0]?.extraParams).toEqual({ reasoning_effort: 'none' });
    expect(state.profiles[0]?.runtime).toEqual({ concurrency: 3, timeoutMs: 60_000, retryCount: 2 });
  });

  it('watch 在配置变化时通知订阅者', async () => {
    const repository = new StoredTranslationProfiles(new MemoryKeyValueStorage());
    const listener = vi.fn();
    const unsubscribe = repository.watch(listener);

    const created = await repository.create(draft());
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)?.[0].profiles.map((profile: { id: string }) => profile.id)).toEqual([
      created.id,
    ]);

    unsubscribe();
    await repository.remove(created.id);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('StoredTranslationProfileCatalog', () => {
  it('只向页面暴露配置 ID、名称和默认状态', async () => {
    const repository = new StoredTranslationProfiles(new MemoryKeyValueStorage());
    const created = await repository.create(draft({ headers: { 'X-Tenant': 'tenant-secret' } }));
    const catalog = new StoredTranslationProfileCatalog(repository);

    const summaries = await catalog.listProfiles();

    expect(summaries).toEqual([{ id: created.id, name: '主力服务', isDefault: true }]);
    const serialized = JSON.stringify(summaries);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('tenant-secret');
    expect(serialized).not.toContain('api.example.com');
  });

  it('没有配置时返回空列表与空默认配置', async () => {
    const catalog = new StoredTranslationProfileCatalog(new StoredTranslationProfiles(new MemoryKeyValueStorage()));

    expect(await catalog.listProfiles()).toEqual([]);
    expect(await catalog.getDefaultProfile()).toBeNull();
  });

  it('默认配置跟随用户切换', async () => {
    const repository = new StoredTranslationProfiles(new MemoryKeyValueStorage());
    const first = await repository.create(draft());
    const second = await repository.create(draft({ name: '备用服务' }));
    const catalog = new StoredTranslationProfileCatalog(repository);

    await repository.setDefault(second.id);

    expect(await catalog.getDefaultProfile()).toEqual({ id: second.id, name: '备用服务', isDefault: true });
    expect((await catalog.listProfiles()).find((profile) => profile.id === first.id)?.isDefault).toBe(false);
  });
});

describe('maskApiKey', () => {
  it('非空密钥脱敏显示且不包含完整密钥', () => {
    const masked = maskApiKey(API_KEY);

    expect(masked).toBeTruthy();
    expect(masked).not.toContain(API_KEY);
    expect(API_KEY.endsWith(masked?.slice(-4) ?? '\u0000')).toBe(true);
  });

  it('短密钥完全遮蔽', () => {
    expect(maskApiKey('sk-1234')).toBe('••••••••');
  });

  it('空密钥没有可展示内容', () => {
    expect(maskApiKey('')).toBeNull();
    expect(maskApiKey('   ')).toBeNull();
  });
});
