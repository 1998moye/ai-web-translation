import { createChromeStorage, type KeyValueStorage } from '../site-preferences/key-value-storage';
import type { ButtonPositionStore } from '../floating-button/button-position-store';
import { StoredButtonPosition } from '../floating-button/button-position-store';
import { pingBackground } from '../messaging/ping-background';
import { requestOpenOptions } from '../messaging/open-options';
import { MessagingProfileCatalog } from '../messaging/profile-catalog-transport';
import { createMessagingTranslationEngine } from '../messaging/translation-transport';
import { PageTranslationController } from '../page-translation/page-translation-controller';
import { createDomSelectionSource } from '../selection-translation/selection-source';
import { SelectionTranslationController } from '../selection-translation/selection-translation-controller';
import { StoredSitePreferences } from '../site-preferences/site-preferences';

export interface ContentAssemblyOptions {
  doc?: Document;
  hostname?: string;
  storage?: KeyValueStorage;
  openSettings?: () => void;
  observeMutations?: boolean;
  mutationDebounceMs?: number;
}

export interface ContentAssembly {
  controller: PageTranslationController;
  selection: SelectionTranslationController;
  positionStore: ButtonPositionStore;
  dispose(): void;
}

/**
 * 内容脚本装配：把 Translation Engine、配置目录、网站偏好、悬浮按钮与划词翻译连接起来。
 */
export function createContentAssembly(options: ContentAssemblyOptions = {}): ContentAssembly {
  const doc = options.doc ?? document;
  const storage = options.storage ?? createChromeStorage();
  const hostname = options.hostname ?? doc.location?.hostname ?? '';

  const engine = createMessagingTranslationEngine();
  const profiles = new MessagingProfileCatalog();
  const preferences = new StoredSitePreferences(storage);
  const positionStore: ButtonPositionStore = new StoredButtonPosition(storage);

  const controller = new PageTranslationController({
    engine,
    profiles,
    preferences,
    hostname,
    openSettings: options.openSettings ?? (() => void requestOpenOptions()),
    doc,
    ...(options.observeMutations !== undefined ? { observeMutations: options.observeMutations } : {}),
    ...(options.mutationDebounceMs !== undefined ? { mutationDebounceMs: options.mutationDebounceMs } : {}),
  });

  void pingBackground()
    .then((health) => controller.setBackgroundConnected(health.ok))
    .catch(() => controller.setBackgroundConnected(false));

  // 划词翻译：选区识别与译文气泡，与整页翻译共用同一个 Engine 与 Catalog。
  const selection = new SelectionTranslationController({
    engine,
    profiles,
    source: createDomSelectionSource(doc),
    doc,
  });
  selection.mount();

  return {
    controller,
    selection,
    positionStore,
    dispose: () => {
      selection.destroy();
      controller.destroy();
    },
  };
}
