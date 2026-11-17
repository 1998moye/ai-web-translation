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
import { FakeTranslationEngine } from '../translation-fake/fake-translation-engine';
import { createFakeProfileCatalog } from '../translation-fake/fake-profile-catalog';

export interface ContentAssemblyOptions {
  doc?: Document;
  hostname?: string;
  storage?: KeyValueStorage;
  openSettings?: () => void;
  /** 测试可关闭动态内容监听。 */
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
 * 生产构建一律使用后台的真实 Engine；只有 AIWT_FAKE_ENGINE=1 的开发演示构建包含 fake。
 */
export function createContentAssembly(options: ContentAssemblyOptions = {}): ContentAssembly {
  const doc = options.doc ?? document;
  // 编译期常量：生产构建中为 false，fake 分支与导入会被摇树移除。
  const useFakeEngine = __AIWT_FAKE_ENGINE__;
  const storage = options.storage ?? createChromeStorage();
  const hostname = options.hostname ?? doc.location?.hostname ?? '';

  const engine = useFakeEngine ? createDemoEngine() : createMessagingTranslationEngine();
  const profiles = useFakeEngine ? createFakeProfileCatalog() : new MessagingProfileCatalog();
  const preferences = new StoredSitePreferences(storage);
  const positionStore: ButtonPositionStore = new StoredButtonPosition(storage);

  const controller = new PageTranslationController({
    engine,
    profiles,
    preferences,
    hostname,
    isFakeEngine: useFakeEngine,
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

/** 开发演示用的 fake Engine：带轻微延迟，便于观察逐批出现的译文。 */
function createDemoEngine(): FakeTranslationEngine {
  return new FakeTranslationEngine({
    delayForUnit: (_unit, index) => 120 + ((index * 47) % 5) * 90,
  });
}
