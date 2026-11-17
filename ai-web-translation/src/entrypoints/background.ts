import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { createHealthResponse, isHealthRequest } from '@/modules/messaging/health';
import { isOpenOptionsRequest } from '@/modules/messaging/open-options';

export default defineBackground(() => {
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

  // 点击扩展图标打开设置页；悬浮按钮的「设置」入口使用同一个页面。
  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });
});
