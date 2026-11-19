import { useEffect, useState } from 'react';
import {
  EMPTY_SITE_PREFERENCES,
  type SitePreferences,
  type SitePreferencesRepository,
} from '@/modules/site-preferences/site-preferences';

export interface SitePreferencesPanelProps {
  repository: SitePreferencesRepository;
}

export function SitePreferencesPanel({ repository }: SitePreferencesPanelProps) {
  const [preferences, setPreferences] = useState<SitePreferences>(EMPTY_SITE_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void repository.read().then((next) => {
      if (!active) return;
      setPreferences(next);
      setLoading(false);
    });
    const unsubscribe = repository.watch((next) => setPreferences(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  const removeAutoTranslate = async (host: string): Promise<void> => {
    await repository.setAutoTranslate(host, false);
    setPreferences(await repository.read());
  };

  const removeDisabledButton = async (host: string): Promise<void> => {
    await repository.enableButtonForSite(host);
    setPreferences(await repository.read());
  };

  return (
    <div className="aiwt-panel">
      <section aria-labelledby="aiwt-auto-translate-heading">
        <h2 id="aiwt-auto-translate-heading">自动翻译网站</h2>
        <p className="aiwt-hint">
          打开这些完整域名时，只有检测到英文内容才会自动开始整页翻译。该列表与悬浮按钮停用列表分别管理，
          在悬浮按钮的展开入口可以为当前网站开启或关闭自动翻译。
        </p>
        <HostList
          hosts={preferences.autoTranslateHosts}
          emptyText="还没有自动翻译网站。可以在网页悬浮按钮中为当前网站开启。"
          removeLabel={(host) => `移除 ${host} 的自动翻译`}
          onRemove={removeAutoTranslate}
        />
      </section>

      <section aria-labelledby="aiwt-disabled-button-heading">
        <h2 id="aiwt-disabled-button-heading">已停用悬浮按钮的网站</h2>
        <p className="aiwt-hint">
          永久停用只隐藏悬浮翻译按钮，不代表关闭翻译。移除记录后，对应网站下次打开或刷新会恢复按钮。
        </p>
        <HostList
          hosts={preferences.disabledButtonHosts}
          emptyText="没有永久关闭悬浮按钮的网站。"
          removeLabel={(host) => `恢复 ${host} 的悬浮按钮`}
          onRemove={removeDisabledButton}
        />
      </section>

      {loading && <p className="aiwt-hint">正在读取本机设置…</p>}
    </div>
  );
}

interface HostListProps {
  hosts: readonly string[];
  emptyText: string;
  removeLabel: (host: string) => string;
  onRemove: (host: string) => Promise<void>;
}

function HostList({ hosts, emptyText, removeLabel, onRemove }: HostListProps) {
  if (hosts.length === 0) return <p className="aiwt-empty">{emptyText}</p>;

  return (
    <ul className="aiwt-host-list">
      {hosts.map((host) => (
        <li key={host}>
          <span>{host}</span>
          <button type="button" aria-label={removeLabel(host)} onClick={() => void onRemove(host)}>
            移除
          </button>
        </li>
      ))}
    </ul>
  );
}
