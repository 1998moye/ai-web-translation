import {
  createProfileDraft,
  DEFAULT_RUNTIME_SETTINGS,
  type TranslationProfile,
  type TranslationProfileDraft,
} from './profile';
import {
  parseExtraParamsJson,
  parseHeaderLines,
  serializeHeaderLines,
  validateProfileDraft,
  type ProfileValidationIssue,
} from './profile-validation';

/**
 * 设置页表单的原始输入：数值字段保留字符串，因为输入框返回的就是字符串。
 * 请求头与额外参数在这里以文本编辑，保存时才解析为结构化字段。
 */
export interface ProfileFormValues {
  name: string;
  url: string;
  apiKey: string;
  model: string;
  headersText: string;
  extraParamsText: string;
  concurrency: string;
  timeoutSeconds: string;
  retryCount: string;
}

export type DraftResult =
  | { ok: true; draft: TranslationProfileDraft }
  | { ok: false; issues: ProfileValidationIssue[] };

export function toFormValues(profile?: TranslationProfile): ProfileFormValues {
  const source = profile ?? createProfileDraft();

  return {
    name: source.name,
    url: source.url,
    apiKey: source.apiKey,
    model: source.model,
    headersText: serializeHeaderLines(source.headers),
    extraParamsText: JSON.stringify(source.extraParams, null, 2),
    concurrency: String(source.runtime.concurrency),
    timeoutSeconds: String(Math.round(source.runtime.timeoutMs / 1000)),
    retryCount: String(source.runtime.retryCount),
  };
}

/**
 * 表单唯一保存入口：解析文本域、换算秒到毫秒，再执行完整保存校验。
 * 解析失败也要继续跑校验，让用户一次看到所有问题。
 */
export function toDraft(values: ProfileFormValues): DraftResult {
  const issues: ProfileValidationIssue[] = [];

  const headers = parseHeaderLines(values.headersText);
  if (!headers.ok) issues.push({ field: 'headers', message: headers.message });

  const extraParams = parseExtraParamsJson(values.extraParamsText);
  if (!extraParams.ok) issues.push({ field: 'extraParams', message: extraParams.message });

  const concurrency = parseIntegerInput(values.concurrency);
  if (concurrency === null) issues.push({ field: 'concurrency', message: '并发数必须是整数。' });

  const timeoutSeconds = parseIntegerInput(values.timeoutSeconds);
  if (timeoutSeconds === null) issues.push({ field: 'timeoutMs', message: '请求超时必须是整数秒。' });

  const retryCount = parseIntegerInput(values.retryCount);
  if (retryCount === null) issues.push({ field: 'retryCount', message: '自动重试次数必须是整数。' });

  const draft: TranslationProfileDraft = {
    name: values.name,
    url: values.url,
    apiKey: values.apiKey,
    model: values.model,
    // 解析失败时先用空值占位，保证后续校验仍能报告其他字段的问题。
    headers: headers.ok ? headers.value : {},
    extraParams: extraParams.ok ? extraParams.value : {},
    runtime: {
      concurrency: concurrency ?? DEFAULT_RUNTIME_SETTINGS.concurrency,
      timeoutMs: (timeoutSeconds ?? DEFAULT_RUNTIME_SETTINGS.timeoutMs / 1000) * 1000,
      retryCount: retryCount ?? DEFAULT_RUNTIME_SETTINGS.retryCount,
    },
  };

  for (const issue of validateProfileDraft(draft)) {
    if (!issues.some((existing) => existing.field === issue.field)) issues.push(issue);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, draft };
}

function parseIntegerInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}
