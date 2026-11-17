import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { createHealthResponse, isHealthRequest } from '@/modules/messaging/health';
import { isOpenOptionsRequest } from '@/modules/messaging/open-options';
import {
  handleConnectionTestRequest,
  isConnectionTestRequest,
} from '@/modules/messaging/connection-test';
import { createFetchHttpAdapter } from '@/modules/translation-chat-completions/http-adapter';

export default defineBackground(() => {
  const http = createFetchHttpAdapter();
  const extensionOrigin = browser.runtime.getURL('/');

  // 后台健康检查：内容脚本与设置页用它确认扩展装配正常。
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isHealthRequest(message)) {
      sendResponse(createHealthResponse(__AIWT_FAKE_ENGINE__, browser.runtime.getManifest().version));
    }

    // 内容脚本不能直接打开设置页，由后台代劳。
    if (isOpenOptionsRequest(message)) {
      void browser.runtime.openOptionsPage();
      sendResponse({ ok: true });
    }

    return false;
  });

  // 测试连接：只有扩展自己的页面可以借后台发起真实翻译请求。
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isConnectionTestRequest(message)) return false;

    void handleConnectionTestRequest(message, sender, {
      http,
      isTrustedSender: (candidate) => isExtensionPage(candidate, extensionOrigin),
    }).then(
      (response) => sendResponse(response),
      () => sendResponse({ ok: false, error: { code: 'unknown', message: '测试连接失败。', retryable: false } }),
    );

    // 异步响应：保持消息通道开启。
    return true;
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
