import type { SanitizedTranslationError, TranslationErrorCode } from './types';

const DEFAULT_MESSAGES: Record<TranslationErrorCode, string> = {
  network: '网络请求失败，请检查网络或翻译服务地址。',
  timeout: '翻译服务响应超时。',
  'rate-limited': '翻译服务请求过于频繁，请稍后重试。',
  server: '翻译服务暂时不可用，请稍后重试。',
  auth: '翻译服务认证失败，请检查 API Key 或认证请求头。',
  'request-invalid': '翻译请求被服务拒绝，请检查模型与额外请求参数。',
  'response-invalid': '翻译服务返回的结果无法解析。',
  cancelled: '翻译任务已取消。',
  'profile-unavailable': '没有可用的翻译服务配置。',
  unknown: '翻译请求失败，请稍后重试。',
};

const DEFAULT_RETRYABLE: Record<TranslationErrorCode, boolean> = {
  network: true,
  timeout: true,
  'rate-limited': true,
  server: true,
  auth: false,
  'request-invalid': false,
  'response-invalid': false,
  cancelled: false,
  'profile-unavailable': false,
  unknown: false,
};

export class TranslationError extends Error {
  constructor(
    readonly code: TranslationErrorCode,
    message?: string,
    readonly detail: { retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'TranslationError';
  }

  toSanitized(): SanitizedTranslationError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.detail.retryable ?? DEFAULT_RETRYABLE[this.code],
      ...(this.detail.retryAfterMs !== undefined ? { retryAfterMs: this.detail.retryAfterMs } : {}),
    };
  }
}

export function createSanitizedError(
  code: TranslationErrorCode,
  message?: string,
  detail: { retryable?: boolean; retryAfterMs?: number } = {},
): SanitizedTranslationError {
  return new TranslationError(code, message, detail).toSanitized();
}

/** 把任意异常收敛为脱敏错误；未知异常不会暴露原始信息。 */
export function sanitizeError(error: unknown): SanitizedTranslationError {
  if (error instanceof TranslationError) return error.toSanitized();
  return createSanitizedError('unknown');
}
