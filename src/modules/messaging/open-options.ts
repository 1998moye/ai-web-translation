import { browser } from 'wxt/browser';

export const OPEN_OPTIONS_REQUEST_TYPE = 'aiwt:open-options';

export interface OpenOptionsRequest {
  type: typeof OPEN_OPTIONS_REQUEST_TYPE;
}

export function createOpenOptionsRequest(): OpenOptionsRequest {
  return { type: OPEN_OPTIONS_REQUEST_TYPE };
}

export function isOpenOptionsRequest(message: unknown): message is OpenOptionsRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === OPEN_OPTIONS_REQUEST_TYPE
  );
}

/**
 * 内容脚本不能直接调用 runtime.openOptionsPage，需要由后台打开设置页。
 * 后台不可用时静默降级：用户仍可从扩展图标进入设置。
 */
export async function requestOpenOptions(): Promise<void> {
  try {
    await browser.runtime.sendMessage(createOpenOptionsRequest());
  } catch {
    // 页面卸载或后台不可用时忽略。
  }
}
