import type { ProfileId } from '@/shared/ids';
import { normalizeText } from '@/shared/text';

/**
 * 插件任务设置：并发、超时和重试是扩展侧行为，不会进入请求体。
 */
export interface ProfileRuntimeSettings {
  concurrency: number;
  timeoutMs: number;
  retryCount: number;
}

/**
 * 一份翻译服务配置：完整 Chat Completions 地址、可选 API Key、模型、
 * 自定义请求头和额外请求参数，全部保存在本机扩展存储。
 */
export interface TranslationProfile {
  id: ProfileId;
  name: string;
  url: string;
  apiKey: string;
  model: string;
  headers: Record<string, string>;
  extraParams: Record<string, unknown>;
  runtime: ProfileRuntimeSettings;
}

/** 用户可编辑的部分；ID 由仓库生成，不参与编辑。 */
export type TranslationProfileDraft = Omit<TranslationProfile, 'id'>;

export const DEFAULT_RUNTIME_SETTINGS: Readonly<ProfileRuntimeSettings> = Object.freeze({
  concurrency: 3,
  timeoutMs: 60_000,
  retryCount: 2,
});

/** 新配置默认显式尝试关闭思考，降低翻译延迟与不必要的推理消耗。 */
export const DEFAULT_EXTRA_PARAMS: Readonly<Record<string, unknown>> = Object.freeze({
  reasoning_effort: 'none',
});

export const RUNTIME_LIMITS = Object.freeze({
  concurrency: { min: 1, max: 16 },
  timeoutSeconds: { min: 1, max: 600 },
  retryCount: { min: 0, max: 5 },
});

/** 这三项由 Translation Engine 管理，用户额外参数不得覆盖。 */
export const RESERVED_REQUEST_FIELDS = ['model', 'messages', 'stream'] as const;

/** 远程地址只允许 HTTPS；本机回环地址允许 HTTP，方便连接本地模型。 */
export const LOCAL_HTTP_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

export function createProfileDraft(overrides: Partial<TranslationProfileDraft> = {}): TranslationProfileDraft {
  return {
    name: '',
    url: '',
    apiKey: '',
    model: '',
    headers: {},
    extraParams: { ...DEFAULT_EXTRA_PARAMS },
    runtime: { ...DEFAULT_RUNTIME_SETTINGS },
    ...overrides,
  };
}

/**
 * 浏览器禁止网页脚本设置的请求头（fetch 规范与 Chrome 实际限制）。
 * 扩展后台可以发送它们，但不会按用户输入生效，因此必须在保存前提示。
 */
const FORBIDDEN_REQUEST_HEADERS = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
]);

export function isForbiddenRequestHeader(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return FORBIDDEN_REQUEST_HEADERS.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-');
}

export type RequestAddressCheck = { ok: true } | { ok: false; message: string };

/** 只校验地址协议与主机，不推断该地址是否为 Chat Completions 端点。 */
export function checkRequestAddress(url: string): RequestAddressCheck {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, message: '请填写完整的请求地址。' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: '请求地址不是合法 URL，请填写完整地址（含 https:// ）。' };
  }

  if (parsed.protocol === 'https:') return { ok: true };
  if (parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.includes(parsed.hostname)) return { ok: true };

  return { ok: false, message: '远程请求地址只允许使用 HTTPS；只有 localhost 和 127.0.0.1 可以使用 HTTP。' };
}

/** API Key 脱敏展示：保留末 4 位便于用户核对，其余遮蔽；空 Key 没有可展示内容。 */
export function maskApiKey(apiKey: string): string | null {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return '••••••••';
  return `••••••••${trimmed.slice(-4)}`;
}

/** 归一化用户输入：去首尾空白、请求头名去空白、数值参数截断到允许范围。 */
export function normalizeProfileDraft(draft: TranslationProfileDraft): TranslationProfileDraft {
  return {
    name: draft.name.trim(),
    url: draft.url.trim(),
    apiKey: draft.apiKey.trim(),
    model: draft.model.trim(),
    headers: normalizeHeaders(draft.headers),
    extraParams: { ...draft.extraParams },
    runtime: {
      concurrency: clampInteger(
        draft.runtime.concurrency,
        DEFAULT_RUNTIME_SETTINGS.concurrency,
        RUNTIME_LIMITS.concurrency.min,
        RUNTIME_LIMITS.concurrency.max,
      ),
      timeoutMs: clampInteger(
        draft.runtime.timeoutMs,
        DEFAULT_RUNTIME_SETTINGS.timeoutMs,
        RUNTIME_LIMITS.timeoutSeconds.min * 1000,
        RUNTIME_LIMITS.timeoutSeconds.max * 1000,
      ),
      retryCount: clampInteger(
        draft.runtime.retryCount,
        DEFAULT_RUNTIME_SETTINGS.retryCount,
        RUNTIME_LIMITS.retryCount.min,
        RUNTIME_LIMITS.retryCount.max,
      ),
    },
  };
}

export function normalizeHeaders(headers: unknown): Record<string, string> {
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) return {};
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const key = name.trim();
    if (!key) continue;
    result[key] = value.trim();
  }
  return result;
}

export function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/** 取小写的请求头值，用于检查是否已经存在 Authorization。 */
export function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

export function hasCustomAuthorization(headers: Record<string, string>): boolean {
  return Boolean(normalizeText(findHeader(headers, 'authorization') ?? ''));
}
