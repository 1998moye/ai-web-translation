import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { createHealthResponse, isHealthRequest } from '@/modules/messaging/health';
import { isOpenOptionsRequest } from '@/modules/messaging/open-options';
import {
  handleConnectionTestRequest,
  isConnectionTestRequest,
} from '@/modules/messaging/connection-test';
import {
  createProfileCatalogResponse,
  isProfileCatalogRequest,
} from '@/modules/messaging/profile-catalog-transport';
import {
  installTranslationPortServer,
  isCancelSessionRequest,
  TRANSLATION_PORT_NAME,
  type PortLike,
} from '@/modules/messaging/translation-transport';
import { createFetchHttpAdapter } from '@/modules/translation-chat-completions/http-adapter';
import { ChatCompletionsTranslationEngine } from '@/modules/translation-engine/chat-completions-engine';
import { createChromeStorage } from '@/modules/site-preferences/key-value-storage';
import { StoredTranslationProfiles } from '@/modules/translation-profile/profile-store';
import { StoredTranslationPrompt } from '@/modules/translation-prompt/prompt-store';
import { StoredTranslationCache } from '@/modules/translation-cache/translation-cache';

export default defineBackground(() => {
  const storage = createChromeStorage();
  const profiles = new StoredTranslationProfiles(storage);
  const prompts = new StoredTranslationPrompt(storage);
  const cache = new StoredTranslationCache(storage);
  const http = createFetchHttpAdapter();
  const engine = new ChatCompletionsTranslationEngine({ http, profiles, prompts, cache });
  const extensionOrigin = browser.runtime.getURL('/');

  // 翻译事件通道：内容脚本开始翻译后逐条推送事件。
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATION_PORT_NAME) return;
    installTranslationPortServer(port as unknown as PortLike, engine);
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 后台健康检查：内容脚本与设置页用它确认扩展装配正常。
    if (isHealthRequest(message)) {
      sendResponse(createHealthResponse(__AIWT_FAKE_ENGINE__, browser.runtime.getManifest().version));
      return false;
    }

    // 内容脚本不能直接打开设置页，由后台代劳。
    if (isOpenOptionsRequest(message)) {
      void browser.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;
    }

    // 内容脚本只能拿到配置摘要，完整配置与密钥留在后台。
    if (isProfileCatalogRequest(message)) {
      void createProfileCatalogResponse(profiles).then(
        (response) => sendResponse(response),
        () => sendResponse({ ok: true, profiles: [] }),
      );
      return true;
    }

    // 取消会话：气泡关闭或页面卸载后停止排队与进行中的请求。
    if (isCancelSessionRequest(message)) {
      void engine.cancelSession(message.sessionId);
      sendResponse({ ok: true });
      return false;
    }

    // 测试连接：只有扩展自己的页面可以借后台发起真实翻译请求。
    if (isConnectionTestRequest(message)) {
      void handleConnectionTestRequest(message, sender, {
        http,
        isTrustedSender: (candidate) => isExtensionPage(candidate, extensionOrigin),
      }).then(
        (response) => sendResponse(response),
        () => sendResponse({ ok: false, error: { code: 'unknown', message: '测试连接失败。', retryable: false } }),
      );
      return true;
    }

    return false;
  });

  // 点击扩展图标打开设置页；悬浮按钮的「设置」入口使用同一个页面。
  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });
});

function isExtensionPage(sender: unknown, extensionOrigin: string): boolean {
  const url = typeof sender === 'object' && sender !== null ? (sender as { url?: unknown }).url : undefined;
  return typeof url === 'string' && url.startsWith(extensionOrigin);
}
