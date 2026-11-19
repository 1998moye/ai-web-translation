import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createChromeStorage } from '@/modules/site-preferences/key-value-storage';
import { StoredSitePreferences } from '@/modules/site-preferences/site-preferences';
import { StoredTranslationProfiles } from '@/modules/translation-profile/profile-store';
import { StoredTranslationPrompt } from '@/modules/translation-prompt/prompt-store';
import { StoredTranslationCache } from '@/modules/translation-cache/translation-cache';
import { HealthStatus } from './health-status';
import { SitePreferencesPanel } from './site-preferences-panel';
import { TranslationCachePanel } from './translation-cache-panel';
import { TranslationProfilesPanel } from './translation-profiles-panel';
import { TranslationPromptPanel } from './translation-prompt-panel';

type PageId = 'models' | 'prompt' | 'cache' | 'sites';

interface PageDefinition {
  id: PageId;
  label: string;
  hint: string;
  title: string;
  subtitle: string;
}

const PAGES: readonly PageDefinition[] = [
  {
    id: 'models',
    label: '翻译服务',
    hint: '模型、地址与密钥',
    title: '翻译服务',
    subtitle: '仅支持英文→中文。填写你自己的 OpenAI 兼容服务；本扩展不内置模型，也不提供共享密钥。',
  },
  {
    id: 'prompt',
    label: '翻译提示词',
    hint: '输出结构与规则',
    title: '翻译提示词',
    subtitle: '约束翻译服务的输出结构，确保翻译单元 ID、占位标记和行内格式不被破坏。',
  },
  {
    id: 'cache',
    label: '译文缓存',
    hint: '复用已翻译内容',
    title: '译文缓存',
    subtitle: '相同原文在相同服务、模型、提示词与请求参数下直接复用译文，减少等待与调用。',
  },
  {
    id: 'sites',
    label: '网站偏好',
    hint: '自动翻译与按钮停用',
    title: '网站偏好',
    subtitle: '按完整域名管理自动翻译网站，以及永久停用悬浮按钮的网站，两类列表互相独立。',
  },
];

const DEFAULT_PAGE: PageDefinition = PAGES[0]!;

function pageFromHash(hash: string): PageId {
  const id = hash.replace(/^#/, '');
  return PAGES.some((page) => page.id === id) ? (id as PageId) : 'models';
}

export function OptionsApp() {
  const [page, setPage] = useState<PageId>(() => pageFromHash(window.location.hash));
  const repository = useMemo(() => new StoredSitePreferences(createChromeStorage()), []);
  const profileRepository = useMemo(() => new StoredTranslationProfiles(createChromeStorage()), []);
  const promptRepository = useMemo(() => new StoredTranslationPrompt(createChromeStorage()), []);
  const translationCache = useMemo(() => new StoredTranslationCache(createChromeStorage()), []);

  useEffect(() => {
    const handleHashChange = (): void => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const current = PAGES.find((item) => item.id === page) ?? DEFAULT_PAGE;

  useEffect(() => {
    document.title = `${current.title} · AI 网页翻译`;
  }, [current.title]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: PageId): void => {
    event.preventDefault();
    if (id === page) return;
    window.location.hash = id;
    setPage(id);
  };

  return (
    <>
      <a className="aiwt-skip" href="#aiwt-content">
        跳到设置内容
      </a>

      <div className="aiwt-shell">
        <aside className="aiwt-sidebar">
          <div className="aiwt-brand">
            <img className="aiwt-brand-icon" src="/icons/icon-48.png" width="42" height="42" alt="" />
            <div className="aiwt-brand-text">
              <p className="aiwt-brand-name">AI 网页翻译</p>
              <p className="aiwt-brand-tag">英文 → 中文 · 自带 AI 配置</p>
            </div>
          </div>

          <nav className="aiwt-nav" aria-label="设置导航">
            {PAGES.map((item) => {
              const active = item.id === page;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="aiwt-nav-item"
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => navigate(event, item.id)}
                >
                  <span className="aiwt-nav-icon" aria-hidden="true">
                    <NavIcon page={item.id} />
                  </span>
                  <span className="aiwt-nav-text">
                    <span className="aiwt-nav-label">{item.label}</span>
                    <span className="aiwt-nav-hint">{item.hint}</span>
                  </span>
                </a>
              );
            })}
          </nav>

          <div className="aiwt-sidebar-foot">
            <HealthStatus />
            <p className="aiwt-sidebar-note">配置、密钥与缓存只保存在本机扩展存储。</p>
          </div>
        </aside>

        <main className="aiwt-main" id="aiwt-content" tabIndex={-1}>
          <div className="aiwt-main-inner">
            <header className="aiwt-page-header">
              <div>
                <h1 className="aiwt-app-title">AI 网页翻译</h1>
                <p className="aiwt-page-subtitle">{current.subtitle}</p>
              </div>
              <span className="aiwt-page-chip">{current.label}</span>
            </header>

            <div className="aiwt-app-notice" role="note">
              <span className="aiwt-app-notice-mark" aria-hidden="true">
                EN → 中
              </span>
              <p>
                <strong>只做英文→中文。</strong>不内置 AI 模型或共享密钥；请先配置你自己的 OpenAI 兼容服务，费用由你与服务商结算。
              </p>
            </div>

            <div className="aiwt-page" key={page}>
              {page === 'models' && (
                <TranslationProfilesPanel repository={profileRepository} promptRepository={promptRepository} />
              )}
              {page === 'prompt' && <TranslationPromptPanel repository={promptRepository} />}
              {page === 'cache' && <TranslationCachePanel cache={translationCache} />}
              {page === 'sites' && <SitePreferencesPanel repository={repository} />}
            </div>

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
          </div>
        </main>
      </div>
    </>
  );
}

function NavIcon({ page }: { page: PageId }) {
  switch (page) {
    case 'models':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M4 7h9M9 4v3M6 7c0 4 2.5 7 6.5 8.5" strokeLinecap="round" />
          <path d="M13 20l4-10 4 10M14.5 17h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'prompt':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M5 5h14v10H9l-4 4V5z" strokeLinejoin="round" />
          <path d="M9 9h6M9 12h4" strokeLinecap="round" />
        </svg>
      );
    case 'cache':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    case 'sites':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.5 2.4 3.8 5 3.8 8s-1.3 5.6-3.8 8c-2.5-2.4-3.8-5-3.8-8S9.5 6.4 12 4z" />
        </svg>
      );
  }
}
