import { collectTranslatableTexts } from '../content-scan/scan-translatable-targets';
import { summarizePageLanguage } from '../language/language';
import {
  EMPTY_SITE_PREFERENCES,
  normalizeHostname,
  type SitePreferences,
  type SitePreferencesRepository,
} from '../site-preferences/site-preferences';
import type { TranslationProfileCatalog } from '../translation-contract/profile-catalog';
import type { TranslationEngine } from '../translation-contract/translation-engine';
import type { PageSessionProgress, PageSessionState } from './page-session-state';
import { PageTranslationSession } from './page-translation-session';

export type FloatingButtonPhase = 'idle' | 'translating' | 'completed' | 'partial-failure' | 'cancelled';

export interface PageControllerSnapshot {
  buttonVisible: boolean;
  phase: FloatingButtonPhase;
  /** 悬浮按钮主操作的可访问名称。 */
  mainActionLabel: string;
  glyph: string;
  statusText: string;
  progress: PageSessionProgress | null;
  canCancel: boolean;
  canRetry: boolean;
  canRetranslate: boolean;
  autoTranslateEnabled: boolean;
  fakeEngine: boolean;
  backgroundConnected: boolean | null;
  notice?: string;
}

export interface PageTranslationControllerOptions {
  engine: TranslationEngine;
  profiles: TranslationProfileCatalog;
  preferences: SitePreferencesRepository;
  hostname: string;
  isFakeEngine: boolean;
  openSettings: () => void;
  doc?: Document;
  mutationDebounceMs?: number;
  observeMutations?: boolean;
}

/**
 * 页面级编排：连接悬浮翻译按钮、网站偏好与页面翻译会话。
 * React 组件只负责渲染快照和转发用户操作，业务规则留在这里。
 */
export class PageTranslationController {
  private readonly options: PageTranslationControllerOptions;
  private readonly hostname: string;
  private readonly doc: Document;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribers: (() => void)[] = [];

  private session: PageTranslationSession | null = null;
  private unsubscribeSession: (() => void) | null = null;
  private preferences: SitePreferences = EMPTY_SITE_PREFERENCES;
  private snapshotCache: PageControllerSnapshot | null = null;
  private dismissedOnce = false;
  private autoSuppressed = false;
  private mounted = false;
  private notice: string | undefined;
  private backgroundConnected: boolean | null = null;

  constructor(options: PageTranslationControllerOptions) {
    this.options = options;
    this.hostname = normalizeHostname(options.hostname);
    this.doc = options.doc ?? document;
  }

  async mount(): Promise<PageControllerSnapshot> {
    if (this.mounted) return this.getSnapshot();
    this.mounted = true;

    this.preferences = await this.options.preferences.read();
    this.unsubscribers.push(
      this.options.preferences.watch((next) => {
        this.preferences = next;
        this.emit();
      }),
    );
    this.emit();

    await this.maybeAutoTranslate();
    return this.getSnapshot();
  }

  getSnapshot(): PageControllerSnapshot {
    if (this.snapshotCache) return this.snapshotCache;

    const state = this.session?.getState();
    const progress = state?.progress ?? null;
    const phase = phaseOf(state);
    const autoTranslateEnabled = this.preferences.autoTranslateHosts.includes(this.hostname);
    const buttonVisible = !this.dismissedOnce && !this.preferences.disabledButtonHosts.includes(this.hostname);

    this.snapshotCache = {
      buttonVisible,
      phase,
      mainActionLabel: mainActionLabelOf(phase),
      glyph: glyphOf(phase),
      statusText: this.statusTextOf(state),
      progress,
      canCancel: phase === 'translating',
      canRetry: phase === 'partial-failure',
      canRetranslate: phase === 'completed' || phase === 'partial-failure' || phase === 'cancelled',
      autoTranslateEnabled,
      fakeEngine: this.options.isFakeEngine,
      backgroundConnected: this.backgroundConnected,
      ...(this.notice ? { notice: this.notice } : {}),
    };

    return this.snapshotCache;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 点击悬浮按钮：未翻译时开始翻译，已有会话时恢复原文。 */
  async togglePageTranslation(): Promise<void> {
    const state = this.session?.getState();
    if (this.session && state && state.status !== 'restored') {
      this.restorePage();
      return;
    }
    await this.startTranslation();
  }

  async startTranslation(): Promise<void> {
    if (this.session) return;

    this.notice = undefined;
    const session = new PageTranslationSession({
      engine: this.options.engine,
      profiles: this.options.profiles,
      doc: this.doc,
      ...(this.options.mutationDebounceMs !== undefined
        ? { mutationDebounceMs: this.options.mutationDebounceMs }
        : {}),
      ...(this.options.observeMutations !== undefined ? { observeMutations: this.options.observeMutations } : {}),
    });

    this.session = session;
    this.unsubscribeSession = session.subscribe(() => this.emit());

    const state = await session.start();
    if (state.status === 'failed') {
      this.notice = state.error?.message ?? '翻译服务不可用，请检查设置。';
      this.detachSession({ restore: false });
      this.emit();
      return;
    }

    this.emit();
  }

  /** 恢复原文：取消任务、停止处理新增内容，译文缓存保留。 */
  restorePage(): void {
    if (!this.session) return;
    this.autoSuppressed = true;
    this.detachSession({ restore: true });
    this.emit();
  }

  cancelTranslation(): void {
    this.session?.cancel();
    this.emit();
  }

  retryFailed(): void {
    this.session?.retryFailed();
    this.emit();
  }

  /** 重新翻译：结束旧会话后创建新会话，从而使用最新的默认配置。 */
  async retranslate(): Promise<void> {
    if (this.session) this.detachSession({ restore: true });
    await this.startTranslation();
  }

  dismissOnce(): void {
    this.dismissedOnce = true;
    this.emit();
  }

  async disableButtonForSite(): Promise<void> {
    await this.options.preferences.disableButtonForSite(this.hostname);
    this.preferences = await this.options.preferences.read();
    this.emit();
  }

  async setAutoTranslate(enabled: boolean): Promise<void> {
    await this.options.preferences.setAutoTranslate(this.hostname, enabled);
    this.preferences = await this.options.preferences.read();
    this.emit();
  }

  openSettings(): void {
    this.options.openSettings();
  }

  setBackgroundConnected(connected: boolean | null): void {
    this.backgroundConnected = connected;
    this.emit();
  }

  destroy(): void {
    this.detachSession({ restore: false });
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.listeners.clear();
  }

  private async maybeAutoTranslate(): Promise<void> {
    if (this.autoSuppressed) return;
    if (!this.preferences.autoTranslateHosts.includes(this.hostname)) return;

    const summary = summarizePageLanguage(collectTranslatableTexts(this.doc));
    if (!summary.isEnglish) return;

    await this.startTranslation();
  }

  private detachSession(options: { restore: boolean }): void {
    const session = this.session;
    if (!session) return;
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.session = null;
    if (options.restore) session.restore();
    else session.dispose();
  }

  private statusTextOf(state: PageSessionState | undefined): string {
    if (!state) return this.notice ?? '点击翻译整页';

    const progress = state.progress;
    switch (state.status) {
      case 'translating':
        return progress.succeeded + progress.failed > 0
          ? `翻译中 ${progress.succeeded + progress.failed}/${progress.total}`
          : '正在准备翻译…';
      case 'completed':
        return progress.succeeded > 0 ? `已翻译 ${progress.succeeded} 段` : '没有需要翻译的英文内容';
      case 'partial-failure':
        return state.lastError
          ? `已完成，${progress.failed} 段失败：${state.lastError.message}`
          : `已完成，${progress.failed} 段失败`;
      case 'cancelled':
        return '已取消翻译';
      case 'failed':
        return state.error?.message ?? this.notice ?? '翻译失败';
      case 'restored':
        return '已恢复原文';
      default:
        return this.notice ?? '点击翻译整页';
    }
  }

  private emit(): void {
    this.snapshotCache = null;
    for (const listener of [...this.listeners]) listener();
  }
}

function phaseOf(state: PageSessionState | undefined): FloatingButtonPhase {
  if (!state) return 'idle';
  switch (state.status) {
    case 'translating':
      return 'translating';
    case 'completed':
      return 'completed';
    case 'partial-failure':
      return 'partial-failure';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
}

function glyphOf(phase: FloatingButtonPhase): string {
  if (phase === 'completed' || phase === 'cancelled') return '原';
  return '译';
}

function mainActionLabelOf(phase: FloatingButtonPhase): string {
  switch (phase) {
    case 'translating':
      return '停止翻译并恢复原文';
    case 'completed':
      return '恢复原文';
    case 'partial-failure':
      return '恢复原文（部分段落翻译失败）';
    case 'cancelled':
      return '恢复原文';
    default:
      return '翻译此页';
  }
}
