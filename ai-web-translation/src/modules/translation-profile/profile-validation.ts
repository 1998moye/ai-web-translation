import { normalizeText } from '@/shared/text';
import { findRequestFormat } from './request-format';
import {
  checkRequestAddress,
  hasCustomAuthorization,
  isForbiddenRequestHeader,
  RESERVED_REQUEST_FIELDS,
  RUNTIME_LIMITS,
  type ProfileRuntimeSettings,
  type TranslationProfileDraft,
} from './profile';

export type ProfileField =
  | 'name'
  | 'url'
  | 'model'
  | 'apiKey'
  | 'headers'
  | 'extraParams'
  | 'concurrency'
  | 'timeoutMs'
  | 'retryCount'
  | 'requestFormat';

/** 面向用户的校验问题：只包含字段与可读原因，不回显密钥或请求头值。 */
export interface ProfileValidationIssue {
  field: ProfileField;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** RFC 7230 token：请求头名称只允许这些字符。 */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** 保存前的完整校验；返回空数组表示可以保存。 */
export function validateProfileDraft(draft: TranslationProfileDraft): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];

  if (!normalizeText(draft.name)) {
    issues.push({ field: 'name', message: '请填写配置名称。' });
  }

  if (!findRequestFormat(draft.requestFormat)) {
    issues.push({ field: 'requestFormat', message: '请选择受支持的请求方式。' });
  }

  const address = checkRequestAddress(draft.url);
  if (!address.ok) {
    issues.push({ field: 'url', message: address.message });
  }

  if (!normalizeText(draft.model)) {
    issues.push({ field: 'model', message: '请填写模型名称。' });
  }

  // 两种认证方式同时生效会让请求头互相覆盖，因此要求用户在保存前明确二选一。
  if (normalizeText(draft.apiKey) && hasCustomAuthorization(draft.headers)) {
    issues.push({
      field: 'apiKey',
      message: 'API Key 与自定义 Authorization 请求头不能同时使用；请留空 API Key，或删除该请求头。',
    });
  }

  issues.push(...validateHeaders(draft.headers));
  issues.push(...validateExtraParams(draft.extraParams));
  issues.push(...validateRuntime(draft.runtime));

  return issues;
}

function validateHeaders(headers: Record<string, string>): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];

  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.trim();

    if (!name) {
      issues.push({ field: 'headers', message: '请求头名称不能为空。' });
      continue;
    }

    if (!HEADER_NAME_PATTERN.test(name)) {
      issues.push({ field: 'headers', message: `请求头名称「${name}」包含不允许的字符。` });
      continue;
    }

    if (isForbiddenRequestHeader(name)) {
      issues.push({
        field: 'headers',
        message: `请求头 ${name} 由浏览器控制，扩展无法设置，请删除。`,
      });
      continue;
    }

    if (/[\r\n]/.test(value)) {
      issues.push({ field: 'headers', message: `请求头 ${name} 的值不能包含换行。` });
    }
  }

  return issues;
}

function validateExtraParams(extraParams: Record<string, unknown>): ProfileValidationIssue[] {
  const reserved = findReservedField(extraParams);
  if (!reserved) return [];

  return [
    {
      field: 'extraParams',
      message: `额外请求参数不能包含保留字段 ${reserved}；model、messages、stream 由 Translation Engine 管理。`,
    },
  ];
}

function validateRuntime(runtime: ProfileRuntimeSettings): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];

  if (!isIntegerWithin(runtime.concurrency, RUNTIME_LIMITS.concurrency)) {
    issues.push({
      field: 'concurrency',
      message: `并发数必须是 ${RUNTIME_LIMITS.concurrency.min}–${RUNTIME_LIMITS.concurrency.max} 之间的整数。`,
    });
  }

  const timeoutRange = { min: RUNTIME_LIMITS.timeoutSeconds.min * 1000, max: RUNTIME_LIMITS.timeoutSeconds.max * 1000 };
  if (!isIntegerWithin(runtime.timeoutMs, timeoutRange)) {
    issues.push({
      field: 'timeoutMs',
      message: `请求超时必须是 ${RUNTIME_LIMITS.timeoutSeconds.min}–${RUNTIME_LIMITS.timeoutSeconds.max} 秒之间的整数。`,
    });
  }

  if (!isIntegerWithin(runtime.retryCount, RUNTIME_LIMITS.retryCount)) {
    issues.push({
      field: 'retryCount',
      message: `自动重试次数必须是 ${RUNTIME_LIMITS.retryCount.min}–${RUNTIME_LIMITS.retryCount.max} 之间的整数。`,
    });
  }

  return issues;
}

function isIntegerWithin(value: number, range: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

function findReservedField(params: Record<string, unknown>): string | undefined {
  return RESERVED_REQUEST_FIELDS.find((field) => hasOwn(params, field));
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * 额外请求参数按 JSON 对象编辑。
 * 空内容表示没有任何额外参数；语法、结构和保留字段在这里一次拒绝。
 */
export function parseExtraParamsJson(text: string): ParseResult<Record<string, unknown>> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 不回显解析错误的原始片段，避免把误粘贴的密钥写进界面或日志。
    return { ok: false, message: '额外请求参数不是合法 JSON，请检查格式，例如 {"reasoning_effort":"none"}。' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: '额外请求参数必须是 JSON 对象。' };
  }

  const params = { ...(parsed as Record<string, unknown>) };
  const reserved = findReservedField(params);
  if (reserved) {
    return { ok: false, message: `额外请求参数不能包含保留字段 ${reserved}。` };
  }

  return { ok: true, value: params };
}

/**
 * 自定义请求头按「名称: 值」逐行编辑；解析错误只报行号与头名，不回显值。
 */
export function parseHeaderLines(text: string): ParseResult<Record<string, string>> {
  if (!text.trim()) return { ok: true, value: {} };

  const headers: Record<string, string> = {};
  const seenNames = new Map<string, string>();
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;

    const colon = line.indexOf(':');
    if (colon < 0) {
      return { ok: false, message: `第 ${index + 1} 行请求头缺少「名称: 值」格式。` };
    }

    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();

    if (!name) {
      return { ok: false, message: `第 ${index + 1} 行请求头名称为空。` };
    }

    if (!HEADER_NAME_PATTERN.test(name)) {
      return { ok: false, message: `请求头名称「${name}」包含不允许的字符。` };
    }

    if (isForbiddenRequestHeader(name)) {
      return { ok: false, message: `请求头 ${name} 由浏览器控制，扩展无法设置，请删除。` };
    }

    const existing = seenNames.get(name.toLowerCase());
    if (existing) {
      return { ok: false, message: `请求头 ${existing} 重复，请只保留一条。` };
    }

    seenNames.set(name.toLowerCase(), name);
    headers[name] = value;
  }

  return { ok: true, value: headers };
}

export function serializeHeaderLines(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}
