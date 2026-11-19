import { browser } from 'wxt/browser';
import { createHealthRequest, isHealthResponse, type HealthResponse } from './health';

/** 内容脚本与设置页共用的后台健康检查。 */
export async function pingBackground(): Promise<HealthResponse> {
  const response: unknown = await browser.runtime.sendMessage(createHealthRequest());
  if (!isHealthResponse(response)) throw new Error('后台返回了无法识别的健康检查结果。');
  return response;
}
