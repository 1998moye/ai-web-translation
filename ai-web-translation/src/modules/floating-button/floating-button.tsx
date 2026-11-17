import { useMemo } from 'react';
import type { PageControllerSnapshot } from '../page-translation/page-translation-controller';
import type { ButtonPositionStore } from './button-position-store';
import { useFloatingButtonPosition } from './use-floating-button-position';

export interface FloatingButtonActions {
  onMainAction: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRetranslate: () => void;
  onToggleAutoTranslate: () => void;
  onOpenSettings: () => void;
  onDismissOnce: () => void;
  onDisableForSite: () => void;
}

export interface FloatingButtonProps {
  snapshot: PageControllerSnapshot;
  positionStore: ButtonPositionStore;
  actions: FloatingButtonActions;
}

export function FloatingButton({ snapshot, positionStore, actions }: FloatingButtonProps) {
  const { position, dragging, panelSide, buttonRef, handlers } = useFloatingButtonPosition({
    store: positionStore,
    onActivate: actions.onMainAction,
  });

  const progress = snapshot.progress;
  const progressText = useMemo(() => {
    if (!progress || progress.total === 0) return null;
    return `待处理 ${progress.pending} · 进行中 ${progress.translating} · 成功 ${progress.succeeded} · 失败 ${progress.failed}`;
  }, [progress]);

  const healthText =
    snapshot.backgroundConnected === null
      ? '正在检查扩展后台…'
      : snapshot.backgroundConnected
        ? '扩展后台已连接'
        : '扩展后台未连接';

  return (
    <div
      ref={buttonRef}
      className="aiwt-fab"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-aiwt-phase={snapshot.phase}
      data-aiwt-dragging={dragging ? 'true' : 'false'}
      data-aiwt-panel-side={panelSide}
    >
      {__AIWT_FAKE_ENGINE__ && snapshot.fakeEngine && <div className="aiwt-fab-badge">开发演示 · 模拟翻译</div>}

      <button
        type="button"
        className="aiwt-fab-main"
        aria-label={snapshot.mainActionLabel}
        title={snapshot.mainActionLabel}
        {...handlers}
      >
        <span className="aiwt-fab-glyph" aria-hidden="true">
          {snapshot.glyph}
        </span>
        {snapshot.phase === 'translating' && <span className="aiwt-fab-spinner" aria-hidden="true" />}
        {snapshot.phase === 'partial-failure' && <span className="aiwt-fab-alert" aria-hidden="true" />}
      </button>

      <div className="aiwt-fab-panel" role="group" aria-label="AI 网页翻译操作">
        <p className="aiwt-fab-status" aria-live="polite">
          {snapshot.statusText}
        </p>
        {snapshot.notice && <p className="aiwt-fab-notice">{snapshot.notice}</p>}
        {progressText && <p className="aiwt-fab-progress-text">{progressText}</p>}

        <div className="aiwt-fab-actions">
          {snapshot.canCancel && (
            <button type="button" onClick={actions.onCancel}>
              停止翻译
            </button>
          )}
          {snapshot.canRetry && (
            <button type="button" onClick={actions.onRetry}>
              重试失败段落
            </button>
          )}
          {snapshot.canRetranslate && (
            <button type="button" onClick={actions.onRetranslate}>
              重新翻译
            </button>
          )}
          <button type="button" onClick={actions.onToggleAutoTranslate}>
            {snapshot.autoTranslateEnabled ? '关闭此网站自动翻译' : '此网站自动翻译'}
          </button>
          <button type="button" onClick={actions.onOpenSettings}>
            设置
          </button>
          <button type="button" onClick={actions.onDismissOnce}>
            关闭一次
          </button>
          <button type="button" onClick={actions.onDisableForSite}>
            此网站永久关闭按钮
          </button>
        </div>

        <p className="aiwt-fab-health" data-aiwt-health={String(snapshot.backgroundConnected)}>
          {healthText}
        </p>
        <p className="aiwt-fab-hint">
          关闭一次只隐藏当前页面；永久关闭按完整域名保存，可在设置页恢复。
        </p>
      </div>
    </div>
  );
}
