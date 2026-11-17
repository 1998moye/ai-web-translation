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
  const { position, dragging, panelSide, panelVertical, buttonRef, handlers } = useFloatingButtonPosition({
    store: positionStore,
    onActivate: actions.onMainAction,
  });

  const progress = snapshot.progress;
  const done = progress ? progress.succeeded + progress.failed : 0;
  const visibleProgress = progress && progress.total > 0 ? progress : null;
  const percent = visibleProgress ? Math.round((done / visibleProgress.total) * 100) : 0;

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
      data-aiwt-panel-v={panelVertical}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // 键盘用户按 Esc 关闭悬浮面板：移走焦点即可结束 focus-within 展开状态。
        (document.activeElement as HTMLElement | null)?.blur();
      }}
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
        <div className="aiwt-fab-panel-head">
          <span className="aiwt-fab-phase" data-phase={snapshot.phase} aria-hidden="true" />
          <p className="aiwt-fab-status" aria-live="polite">
            {snapshot.statusText}
          </p>
          {visibleProgress && (
            <span className="aiwt-fab-count" aria-hidden="true">
              {done}/{visibleProgress.total}
            </span>
          )}
        </div>

        {visibleProgress && snapshot.phase !== 'completed' && snapshot.phase !== 'cancelled' && (
          <div
            className="aiwt-fab-progress"
            role="progressbar"
            aria-label="翻译进度"
            aria-valuemin={0}
            aria-valuemax={visibleProgress.total}
            aria-valuenow={done}
          >
            <span className="aiwt-fab-progress-bar" style={{ width: `${percent}%` }} />
          </div>
        )}

        {snapshot.notice && <p className="aiwt-fab-notice">{snapshot.notice}</p>}

        {(snapshot.canCancel || snapshot.canRetry || snapshot.canRetranslate) && (
          <div className="aiwt-fab-actions">
            {snapshot.canCancel && (
              <button type="button" className="aiwt-fab-action aiwt-fab-action-danger" onClick={actions.onCancel}>
                停止翻译
              </button>
            )}
            {snapshot.canRetry && (
              <button type="button" className="aiwt-fab-action aiwt-fab-action-primary" onClick={actions.onRetry}>
                重试失败段落
              </button>
            )}
            {snapshot.canRetranslate && (
              <button type="button" className="aiwt-fab-action" onClick={actions.onRetranslate}>
                重新翻译
              </button>
            )}
          </div>
        )}

        <div className="aiwt-fab-menu" role="group" aria-label="网站与扩展设置">
          <button
            type="button"
            className="aiwt-fab-menu-item"
            aria-pressed={snapshot.autoTranslateEnabled}
            onClick={actions.onToggleAutoTranslate}
          >
            <span className="aiwt-fab-menu-icon" aria-hidden="true">
              <GlobeIcon />
            </span>
            <span className="aiwt-fab-menu-label">
              {snapshot.autoTranslateEnabled ? '关闭此网站自动翻译' : '此网站自动翻译'}
            </span>
            <span className="aiwt-fab-switch" data-on={snapshot.autoTranslateEnabled} aria-hidden="true">
              <i />
            </span>
          </button>

          <button type="button" className="aiwt-fab-menu-item" onClick={actions.onOpenSettings}>
            <span className="aiwt-fab-menu-icon" aria-hidden="true">
              <GearIcon />
            </span>
            <span className="aiwt-fab-menu-label">设置</span>
          </button>

          <button type="button" className="aiwt-fab-menu-item" onClick={actions.onDismissOnce}>
            <span className="aiwt-fab-menu-icon" aria-hidden="true">
              <EyeOffIcon />
            </span>
            <span className="aiwt-fab-menu-label">关闭一次</span>
          </button>

          <button type="button" className="aiwt-fab-menu-item" onClick={actions.onDisableForSite}>
            <span className="aiwt-fab-menu-icon" aria-hidden="true">
              <BlockIcon />
            </span>
            <span className="aiwt-fab-menu-label">此网站永久关闭按钮</span>
          </button>
        </div>

        <footer className="aiwt-fab-panel-foot">
          <p className="aiwt-fab-health" data-aiwt-health={String(snapshot.backgroundConnected)}>
            <span className="aiwt-fab-health-dot" aria-hidden="true" />
            {healthText}
          </p>
          <p className="aiwt-fab-hint">关闭一次只隐藏当前页面；永久关闭按完整域名保存，可在设置页恢复。</p>
        </footer>
      </div>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.4 3.8 5 3.8 8s-1.3 5.6-3.8 8c-2.5-2.4-3.8-5-3.8-8S9.5 6.4 12 4z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 12s3.4-5.5 9-5.5 9 5.5 9 5.5-3.4 5.5-9 5.5S3 12 3 12z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
      <path d="M6.3 6.3l11.4 11.4" strokeLinecap="round" />
    </svg>
  );
}
