import { createChromeStorage, type KeyValueStorage } from '../site-preferences/key-value-storage';
import type { ButtonPositionStore } from '../floating-button/button-position-store';
import { StoredButtonPosition } from '../floating-button/button-position-store';
import { pingBackground } from '../messaging/ping-background';
import { requestOpenOptions } from '../messaging/open-options';
import { PageTranslationController } from '../page-translation/page-translation-controller';
import { StoredSitePreferences } from '../site-preferences/site-preferences';
import { FakeTranslationEngine } from '../translation-fake/fake-translation-engine';
import { createFakeProfileCatalog } from '../translation-fake/fake-profile-catalog';
import {
  createUnavailableProfileCatalog,
  createUnavailableTranslationEngine,
} from '../translation-fake/unavailable-translation';

export interface ContentAssemblyOptions {
  doc?: Document;
  hostname?: string;
  /** 测试或开发演示显式启用 fake Translation Engine。 */
  useFakeEngine?: boolean;
  storage?: KeyValueStorage;
  openSettings?: () => void;
  /** 测试可关闭动态内容监听。 */
  observeMutations?: boolean;
  mutationDebounceMs?: number;
}

export interface ContentAssembly {
  controller: PageTranslationController;
  positionStore: ButtonPositionStore;
  dispose(): void;
}

/**
 * 内容脚本装配：把 Translation Engine、配置目录、网站偏好和悬浮按钮连接起来。
 * 生产装配使用占位 Engine（不伪造译文）；开发演示构建使用 fake Adapter。
 */
export function createContentAssembly(options: ContentAssemblyOptions = {}): ContentAssembly {
  const doc = options.doc ?? document;
  const useFakeEngine = options.useFakeEngine ?? __AIWT_FAKE_ENGINE__;
  const storage = options.storage ?? createChromeStorage();
  const hostname = options.hostname ?? doc.location?.hostname ?? '';

  const engine = useFakeEngine ? createDemoEngine() : createUnavailableTranslationEngine();
  const profiles = useFakeEngine ? createFakeProfileCatalog() : createUnavailableProfileCatalog();
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

  return {
    controller,
    positionStore,
    dispose: () => controller.destroy(),
  };
}

/** 开发演示用的 fake Engine：带轻微延迟，便于观察逐批出现的译文。 */
function createDemoEngine(): FakeTranslationEngine {
  return new FakeTranslationEngine({
    delayForUnit: (_unit, index) => 120 + ((index * 47) % 5) * 90,
  });
}
