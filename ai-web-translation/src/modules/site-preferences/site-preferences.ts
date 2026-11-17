import type { KeyValueStorage } from './key-value-storage';

export const SITE_PREFERENCES_KEY = 'aiwt.sitePreferences';

export interface SitePreferences {
  /** 悬浮按钮站点停用：按完整域名持久隐藏悬浮翻译按钮。 */
  disabledButtonHosts: string[];
  /** 自动翻译网站：打开这些完整域名时自动创建页面翻译会话。 */
  autoTranslateHosts: string[];
}

export const EMPTY_SITE_PREFERENCES: SitePreferences = {
  disabledButtonHosts: [],
  autoTranslateHosts: [],
};

export interface SitePreferencesRepository {
  read(): Promise<SitePreferences>;
  isButtonDisabled(hostname: string): Promise<boolean>;
  disableButtonForSite(hostname: string): Promise<void>;
  enableButtonForSite(hostname: string): Promise<void>;
  isAutoTranslateEnabled(hostname: string): Promise<boolean>;
  setAutoTranslate(hostname: string, enabled: boolean): Promise<void>;
  watch(listener: (preferences: SitePreferences) => void): () => void;
}

/** 完整域名：小写、去掉端口与结尾点，子域之间互不影响。 */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

/** 接受 DNS 主机名、localhost、IPv4/IPv6 字面量；拒绝 URL 片段与空白。 */
function isValidHostname(host: string): boolean {
  if (!host) return false;
  if (/[\s/?#@]/.test(host)) return false;
  return true;
}

function normalizeHostList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hosts = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const host = normalizeHostname(item);
    if (isValidHostname(host)) hosts.add(host);
  }
  return [...hosts].sort();
}

export function normalizeSitePreferences(value: unknown): SitePreferences {
  if (typeof value !== 'object' || value === null) {
    return { disabledButtonHosts: [], autoTranslateHosts: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    disabledButtonHosts: normalizeHostList(record.disabledButtonHosts),
    autoTranslateHosts: normalizeHostList(record.autoTranslateHosts),
  };
}

/** 两类网站偏好分别保存在同一记录的独立列表中，互不误删。 */
export class StoredSitePreferences implements SitePreferencesRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async read(): Promise<SitePreferences> {
    const stored = await this.storage.read<unknown>(SITE_PREFERENCES_KEY);
    return normalizeSitePreferences(stored);
  }

  async isButtonDisabled(hostname: string): Promise<boolean> {
    const preferences = await this.read();
    return preferences.disabledButtonHosts.includes(normalizeHostname(hostname));
  }

  async disableButtonForSite(hostname: string): Promise<void> {
    await this.update('disabledButtonHosts', normalizeHostname(hostname), 'add');
  }

  async enableButtonForSite(hostname: string): Promise<void> {
    await this.update('disabledButtonHosts', normalizeHostname(hostname), 'remove');
  }

  async isAutoTranslateEnabled(hostname: string): Promise<boolean> {
    const preferences = await this.read();
    return preferences.autoTranslateHosts.includes(normalizeHostname(hostname));
  }

  async setAutoTranslate(hostname: string, enabled: boolean): Promise<void> {
    await this.update('autoTranslateHosts', normalizeHostname(hostname), enabled ? 'add' : 'remove');
  }

  watch(listener: (preferences: SitePreferences) => void): () => void {
    return this.storage.watch(SITE_PREFERENCES_KEY, (value) => listener(normalizeSitePreferences(value)));
  }

  private async update(
    list: keyof SitePreferences,
    hostname: string,
    action: 'add' | 'remove',
  ): Promise<void> {
    if (!hostname) return;
    const preferences = await this.read();
    const next = new Set(preferences[list]);
    if (action === 'add') next.add(hostname);
    else next.delete(hostname);

    await this.storage.write(SITE_PREFERENCES_KEY, {
      ...preferences,
      [list]: [...next].sort(),
    });
  }
}
