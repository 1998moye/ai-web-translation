import { describe, expect, it } from 'vitest';
import type { TranslationProfile } from '@/modules/translation-profile/profile';
import { toDraft, toFormValues, type ProfileFormValues } from '@/modules/translation-profile/profile-form';

const EXISTING: TranslationProfile = {
  id: 'prof_existing',
  requestFormat: 'chat-completions',
  name: '主力服务',
  url: 'https://api.example.com/v1/chat/completions',
  apiKey: 'sk-live-secret-abcd1234',
  model: 'gpt-4o-mini',
  headers: { 'X-Tenant': 'team-a' },
  extraParams: { temperature: 0.2 },
  runtime: { concurrency: 5, timeoutMs: 90_000, retryCount: 1 },
};

function values(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
  return {
    ...toFormValues(EXISTING),
    ...overrides,
  };
}

describe('toFormValues', () => {
  it('新建配置时回填默认额外请求参数与默认运行参数', () => {
    const form = toFormValues();

    expect(form.name).toBe('');
    expect(form.apiKey).toBe('');
    expect(JSON.parse(form.extraParamsText)).toEqual({ reasoning_effort: 'none' });
    expect(form.concurrency).toBe('3');
    expect(form.timeoutSeconds).toBe('60');
    expect(form.retryCount).toBe('2');
  });

  it('编辑现有配置时回填全部字段，超时以秒展示', () => {
    const form = toFormValues(EXISTING);

    expect(form.name).toBe('主力服务');
    expect(form.url).toBe('https://api.example.com/v1/chat/completions');
    expect(form.apiKey).toBe('sk-live-secret-abcd1234');
    expect(form.model).toBe('gpt-4o-mini');
    expect(form.headersText).toBe('X-Tenant: team-a');
    expect(JSON.parse(form.extraParamsText)).toEqual({ temperature: 0.2 });
    expect(form.concurrency).toBe('5');
    expect(form.timeoutSeconds).toBe('90');
    expect(form.retryCount).toBe('1');
  });
});

describe('toDraft', () => {
  it('保存时把请求头与额外参数文本解析回结构化字段', () => {
    const result = toDraft(
      values({
        headersText: 'X-Tenant: team-a\nAuthorization: Bearer token-1234',
        extraParamsText: '{"reasoning_effort":"none","top_p":0.9}',
        apiKey: '',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.headers).toEqual({ 'X-Tenant': 'team-a', Authorization: 'Bearer token-1234' });
    expect(result.draft.extraParams).toEqual({ reasoning_effort: 'none', top_p: 0.9 });
    expect(result.draft.apiKey).toBe('');
  });

  it('把超时秒转成毫秒并保留其余运行参数', () => {
    const result = toDraft(values({ concurrency: '8', timeoutSeconds: '120', retryCount: '0' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.runtime).toEqual({ concurrency: 8, timeoutMs: 120_000, retryCount: 0 });
  });

  it('请求头格式错误时不产出草稿', () => {
    const result = toDraft(values({ headersText: 'missing-colon-line' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toEqual(['headers']);
  });

  it('额外请求参数不是合法 JSON 时不产出草稿', () => {
    const result = toDraft(values({ extraParamsText: '{"reasoning_effort":none}' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toEqual(['extraParams']);
  });

  it('运行参数不是数字时不产出草稿', () => {
    const result = toDraft(values({ concurrency: 'three' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toEqual(['concurrency']);
  });

  it('合并解析问题与保存校验问题，全部带字段', () => {
    const result = toDraft(values({ name: '', extraParamsText: '[]' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field).sort()).toEqual(['extraParams', 'name']);
    for (const issue of result.issues) expect(issue.message.length).toBeGreaterThan(0);
  });

  it('合法表单产出可通过保存校验的草稿', () => {
    const result = toDraft(toFormValues(EXISTING));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toEqual({
      name: EXISTING.name,
      requestFormat: EXISTING.requestFormat,
      url: EXISTING.url,
      apiKey: EXISTING.apiKey,
      model: EXISTING.model,
      headers: EXISTING.headers,
      extraParams: EXISTING.extraParams,
      runtime: EXISTING.runtime,
    });
  });
});
