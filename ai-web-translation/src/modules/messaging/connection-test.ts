import { browser } from 'wxt/browser';
import { runConnectionTest } from '../translation-chat-completions/connection-test';
import type { HttpAdapter } from '../translation-chat-completions/http-adapter';
import { createSanitizedError } from '../translation-contract/sanitized-error';
import type { SanitizedTranslationError } from '../translation-contract/types';
import { validateProfileDraft } from '../translation-profile/profile-validation';
import type { TranslationProfileDraft } from '../translation-profile/profile';

export const CONNECTION_TEST_REQUEST_TYPE = 'aiwt:connection-test';

/**
 * 测试连接请求携带用户正在编辑的完整配置（含 API Key）。
 * 它只在扩展自己的设置页与后台之间传递，内容脚本与网页都读不到。
 */
export interface ConnectionTestRequest {
  type: typeof CONNECTION_TEST_REQUEST_TYPE;
  profile: TranslationProfileDraft;
  prompt: string;
}

export type ConnectionTestResponse =
  | { ok: true; translation: string }
  | { ok: false; error: SanitizedTranslationError };

export function createConnectionTestRequest(
  profile: TranslationProfileDraft,
  prompt: string,
): ConnectionTestRequest {
  return { type: CONNECTION_TEST_REQUEST_TYPE, profile, prompt };
}

export function isConnectionTestRequest(message: unknown): message is ConnectionTestRequest {
  if (typeof message !== 'object' || message === null) return false;
  const record = message as Record<string, unknown>;
  return (
    record.type === CONNECTION_TEST_REQUEST_TYPE &&
    typeof record.profile === 'object' &&
    record.profile !== null &&
    typeof record.prompt === 'string'
  );
}

export function isConnectionTestResponse(value: unknown): value is ConnectionTestResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.ok === true) return typeof record.translation === 'string';
  if (record.ok !== false) return false;
  const error = record.error;
  return typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string';
}

export interface ConnectionTestServerDeps {
  http: HttpAdapter;
  /** 只接受扩展自己的页面，内容脚本不能借后台发起任意请求。 */
  isTrustedSender(sender: unknown): boolean;
}

/** 后台侧处理：校验来源与配置后发起一次真实请求。 */
export async function handleConnectionTestRequest(
  message: unknown,
  sender: unknown,
  deps: ConnectionTestServerDeps,
): Promise<ConnectionTestResponse> {
  if (!isConnectionTestRequest(message)) {
    return { ok: false, error: createSanitizedError('unknown', '无法识别的测试连接请求。') };
  }

  if (!deps.isTrustedSender(sender)) {
    return { ok: false, error: createSanitizedError('unknown', '只允许扩展设置页发起测试连接。') };
  }

  const issues = validateProfileDraft(message.profile);
  const firstIssue = issues[0];
  if (firstIssue) {
    return { ok: false, error: createSanitizedError('request-invalid', firstIssue.message) };
  }

  return runConnectionTest({ profile: message.profile, prompt: message.prompt, http: deps.http });
}

/** 设置页侧调用：后台不可用时给出可读的脱敏错误，而不是抛异常。 */
export async function requestConnectionTest(
  profile: TranslationProfileDraft,
  prompt: string,
): Promise<ConnectionTestResponse> {
  try {
    const response = await browser.runtime.sendMessage(createConnectionTestRequest(profile, prompt));
    if (isConnectionTestResponse(response)) return response;
  } catch {
    // 后台未就绪或页面正在卸载。
  }

  return { ok: false, error: createSanitizedError('unknown', '设置页与扩展后台通信失败，请重新加载扩展后再试。') };
}
