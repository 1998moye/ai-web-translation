import { useMemo, useState } from 'react';
import { createChromeStorage } from '@/modules/site-preferences/key-value-storage';
import { StoredSitePreferences } from '@/modules/site-preferences/site-preferences';
import { HealthStatus } from './health-status';
import { SitePreferencesPanel } from './site-preferences-panel';
import { TranslationProfilesPanel } from './translation-profiles-panel';

type TabId = 'profiles' | 'sites';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'profiles', label: '翻译服务配置' },
  { id: 'sites', label: '网站偏好' },
];

export function OptionsApp() {
  const [tab, setTab] = useState<TabId>('profiles');
  const repository = useMemo(() => new StoredSitePreferences(createChromeStorage()), []);

  return (
    <main className="aiwt-options">
      <header className="aiwt-options-header">
        <div>
          <h1>AI 网页翻译</h1>
          <p className="aiwt-options-subtitle">使用你自己配置的 AI 翻译服务阅读英文网页。</p>
        </div>
        <HealthStatus />
      </header>

      <nav className="aiwt-tabs" role="tablist" aria-label="设置分类">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`aiwt-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`aiwt-panel-${item.id}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section
        role="tabpanel"
        id="aiwt-panel-profiles"
        aria-labelledby="aiwt-tab-profiles"
        hidden={tab !== 'profiles'}
      >
        <TranslationProfilesPanel />
      </section>

      <section role="tabpanel" id="aiwt-panel-sites" aria-labelledby="aiwt-tab-sites" hidden={tab !== 'sites'}>
        <SitePreferencesPanel repository={repository} />
      </section>

      <footer className="aiwt-options-footer">
        <h2>权限说明</h2>
        <p>
          本扩展需要「读取和更改您在所有网站上的数据」权限，用于在普通网页显示悬浮翻译按钮，并在你点击翻译后读取页面文本。
          扩展不会自动发送页面内容：只有你点击翻译，或为某个网站开启自动翻译后，待翻译文本才会发送到你选择的翻译服务。
        </p>
        <p>
          浏览器内部页、扩展商店和其他受保护页面不保证注入；本地文件访问不是首版默认能力。
          翻译服务配置与 API Key 只保存在本机扩展存储中，页面脚本只能接触配置 ID。
        </p>
      </footer>
    </main>
  );
}
