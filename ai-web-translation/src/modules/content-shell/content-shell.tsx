import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { ButtonPositionStore } from '../floating-button/button-position-store';
import { FloatingButton, type FloatingButtonActions } from '../floating-button/floating-button';
import type { PageTranslationController } from '../page-translation/page-translation-controller';

export interface ContentShellProps {
  controller: PageTranslationController;
  positionStore: ButtonPositionStore;
  /**
   * 划词翻译浮层的装配位置（由「配置与划词翻译」实现提供）。
   * 本组不实现划词功能，只保证两层 UI 共用同一个 Shadow DOM 容器。
   */
  selectionLayer?: ReactNode;
}

export function ContentShell({ controller, positionStore, selectionLayer }: ContentShellProps) {
  const snapshot = useSyncExternalStore(
    useCallback((onStoreChange: () => void) => controller.subscribe(onStoreChange), [controller]),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );

  const actions = useMemo<FloatingButtonActions>(
    () => ({
      onMainAction: () => {
        void controller.togglePageTranslation();
      },
      onCancel: () => controller.cancelTranslation(),
      onRetry: () => controller.retryFailed(),
      onRetranslate: () => {
        void controller.retranslate();
      },
      onToggleAutoTranslate: () => {
        void controller.setAutoTranslate(!snapshot.autoTranslateEnabled);
      },
      onOpenSettings: () => controller.openSettings(),
      onDismissOnce: () => controller.dismissOnce(),
      onDisableForSite: () => {
        void controller.disableButtonForSite();
      },
    }),
    [controller, snapshot.autoTranslateEnabled],
  );

  return (
    <>
      {selectionLayer ?? null}
      {snapshot.buttonVisible && (
        <FloatingButton snapshot={snapshot} positionStore={positionStore} actions={actions} />
      )}
    </>
  );
}
