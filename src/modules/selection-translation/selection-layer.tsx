import { useCallback, useSyncExternalStore } from 'react';
import type { SelectionBubbleState, SelectionTranslationController } from './selection-translation-controller';

export interface SelectionLayerProps {
  controller: SelectionTranslationController;
}

/**
 * 划词翻译浮层：翻译图标与译文气泡。
 * 只负责渲染快照和转发用户操作，业务规则留在 SelectionTranslationController。
 */
export function SelectionLayer({ controller }: SelectionLayerProps) {
  const snapshot = useSyncExternalStore(
    useCallback((onChange: () => void) => controller.subscribe(onChange), [controller]),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );

  const { iconPosition, iconIssue, bubble } = snapshot;
  const available = iconIssue === null;

  return (
    <>
      {iconPosition && (
        <button
          type="button"
          className="aiwt-selection-icon"
          style={{ left: `${iconPosition.left}px`, top: `${iconPosition.top}px` }}
          data-aiwt-available={available ? 'true' : 'false'}
          aria-label={available ? '翻译选中的文本' : `翻译选中的文本（${iconIssue}）`}
          title={available ? '翻译选中的文本' : (iconIssue ?? undefined)}
          // 阻止 mousedown 清空浏览器选区，否则点击后拿不到原文。
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void controller.translateSelection()}
        >
          <span aria-hidden="true">译</span>
        </button>
      )}

      {bubble && <Bubble bubble={bubble} controller={controller} />}
    </>
  );
}

function Bubble({
  bubble,
  controller,
}: {
  bubble: SelectionBubbleState;
  controller: SelectionTranslationController;
}) {
  const showProfiles = bubble.profiles.length > 0 && bubble.units.length > 0;

  return (
    <div
      className="aiwt-selection-bubble"
      style={{ left: `${bubble.position.left}px`, top: `${bubble.position.top}px` }}
      role="dialog"
      aria-label="划词翻译译文"
      data-aiwt-status={bubble.status}
    >
      <div className="aiwt-selection-bubble-head">
        <span>{headlineOf(bubble)}</span>
        <button type="button" aria-label="关闭译文气泡" onClick={() => controller.closeBubble()}>
          ×
        </button>
      </div>

      {showProfiles && (
        <label className="aiwt-selection-profiles">
          <span>翻译服务</span>
          <select
            value={bubble.profileId}
            aria-label="选择翻译服务配置"
            onChange={(event) => void controller.selectProfile(event.target.value)}
          >
            {bubble.profileId === '' && <option value="">请选择配置</option>}
            {bubble.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
                {profile.isDefault ? '（默认）' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {bubble.message && (
        <p className="aiwt-selection-error" role="alert">
          {bubble.message}
        </p>
      )}

      {bubble.units.length > 0 && (
        <ol className="aiwt-selection-units">
          {bubble.units.map((unit) => (
            <li key={unit.id} data-aiwt-unit-status={unit.error ? 'error' : unit.translation ? 'done' : 'pending'}>
              {unit.translation !== undefined && (
                <p className="aiwt-selection-translation" lang="zh-CN">
                  {unit.translation}
                </p>
              )}
              {unit.error !== undefined && (
                <p className="aiwt-selection-error" role="alert">
                  {unit.error}
                </p>
              )}
              {unit.translation === undefined && unit.error === undefined && (
                <p className="aiwt-selection-pending" aria-live="polite">
                  正在等待翻译服务返回…
                </p>
              )}
              <p className="aiwt-selection-source" lang="en">
                {unit.sourceText}
              </p>
            </li>
          ))}
        </ol>
      )}

      {bubble.status === 'loading' && bubble.units.length === 0 && (
        <p className="aiwt-selection-pending" aria-live="polite">
          正在等待翻译服务返回…
        </p>
      )}
    </div>
  );
}

function headlineOf(bubble: SelectionBubbleState): string {
  switch (bubble.status) {
    case 'loading':
      return '正在翻译…';
    case 'success':
      return '译文';
    case 'partial':
      return '部分译文';
    default:
      return '翻译失败';
  }
}
