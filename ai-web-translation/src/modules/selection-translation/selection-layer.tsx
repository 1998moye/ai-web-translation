import { useCallback, useSyncExternalStore } from 'react';
import type { SelectionTranslationController } from './selection-translation-controller';

export interface SelectionLayerProps {
  controller: SelectionTranslationController;
}

/**
 * 划词翻译浮层：翻译图标与译文气泡。
 * 只负责渲染快照和转发点击，业务规则留在 SelectionTranslationController。
 */
export function SelectionLayer({ controller }: SelectionLayerProps) {
  const snapshot = useSyncExternalStore(
    useCallback((onChange: () => void) => controller.subscribe(onChange), [controller]),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );

  const { iconPosition, bubble } = snapshot;

  return (
    <>
      {iconPosition && (
        <button
          type="button"
          className="aiwt-selection-icon"
          style={{ left: `${iconPosition.left}px`, top: `${iconPosition.top}px` }}
          aria-label="翻译选中的文本"
          title="翻译选中的文本"
          // 阻止 mousedown 清空浏览器选区，否则点击后拿不到原文。
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void controller.translateSelection()}
        >
          <span aria-hidden="true">译</span>
        </button>
      )}

      {bubble && (
        <div
          className="aiwt-selection-bubble"
          style={{ left: `${bubble.position.left}px`, top: `${bubble.position.top}px` }}
          role="dialog"
          aria-label="划词翻译译文"
          data-aiwt-status={bubble.status}
        >
          <div className="aiwt-selection-bubble-head">
            <span>{bubble.status === 'loading' ? '正在翻译…' : bubble.status === 'success' ? '译文' : '翻译失败'}</span>
            <button type="button" aria-label="关闭译文气泡" onClick={() => controller.closeBubble()}>
              ×
            </button>
          </div>

          {bubble.status === 'loading' && (
            <p className="aiwt-selection-loading" aria-live="polite">
              正在等待翻译服务返回…
            </p>
          )}

          {bubble.status === 'success' && (
            <>
              <p className="aiwt-selection-translation" lang="zh-CN">
                {bubble.translation}
              </p>
              <p className="aiwt-selection-source" lang="en">
                {bubble.sourceText}
              </p>
            </>
          )}

          {bubble.status === 'error' && (
            <p className="aiwt-selection-error" role="alert">
              {bubble.message}
            </p>
          )}
        </div>
      )}
    </>
  );
}
