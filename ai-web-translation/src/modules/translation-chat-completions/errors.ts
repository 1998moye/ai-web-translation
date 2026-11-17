import { TranslationError } from '../translation-contract/sanitized-error';
import type { HttpFailureReason } from './http-adapter';

/** 传输失败：只有网络问题可重试；超时与取消按配置与用户操作处理。 */
export function errorForHttpFailure(reason: HttpFailureReason): TranslationError {
  switch (reason) {
    case 'timeout':
      return new TranslationError('timeout');
    case 'aborted':
      return new TranslationError('cancelled');
    case 'network':
      return new TranslationError('network');
  }
}

/**
 * HTTP 状态分类：400/401/403 直接报告不重试，
 * 429 与 5xx 可有限重试，429 尊重服务返回的等待时间。
 * 错误消息只带状态码，不回显响应体或请求头。
 */
export function errorForHttpStatus(status: number, headers: Record<string, string>): TranslationError {
  if (status === 401 || status === 403) {
    return new TranslationError(
      'auth',
      `翻译服务认证失败（HTTP ${status}），请检查 API Key 或自定义认证请求头。`,
    );
  }

  if (status === 429) {
    const retryAfterMs = parseRetryAfterMs(headers);
    return new TranslationError(
      'rate-limited',
      undefined,
      retryAfterMs === undefined ? {} : { retryAfterMs },
    );
  }

  if (status >= 500) {
    return new TranslationError('server', `翻译服务暂时不可用（HTTP ${status}），请稍后重试。`);
  }

  if (status === 404 || status === 405) {
    return new TranslationError(
      'request-invalid',
      `请求地址可能不是 Chat Completions 端点（HTTP ${status}），请检查完整地址。`,
    );
  }

  return new TranslationError(
    'request-invalid',
    `翻译请求被拒绝（HTTP ${status}），请检查模型名与额外请求参数。`,
  );
}

/** Retry-After 支持秒数和 HTTP 日期两种写法。 */
export function parseRetryAfterMs(headers: Record<string, string>): number | undefined {
  const value = headers['retry-after'];
  if (!value) return undefined;

  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());

  return undefined;
}
