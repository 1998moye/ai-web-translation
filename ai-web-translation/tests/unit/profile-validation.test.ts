import { describe, expect, it } from 'vitest';
import {
  createProfileDraft,
  DEFAULT_EXTRA_PARAMS,
  DEFAULT_RUNTIME_SETTINGS,
  type TranslationProfileDraft,
} from '@/modules/translation-profile/profile';
import {
  parseExtraParamsJson,
  parseHeaderLines,
  serializeHeaderLines,
  validateProfileDraft,
} from '@/modules/translation-profile/profile-validation';

const API_KEY = 'sk-live-secret-abcd1234';

function draft(overrides: Partial<TranslationProfileDraft> = {}): TranslationProfileDraft {
  return {
    ...createProfileDraft(),
    name: '主力服务',
    url: 'https://api.example.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    ...overrides,
  };
}

function fields(draftValue: TranslationProfileDraft): string[] {
  return validateProfileDraft(draftValue).map((issue) => issue.field);
}

describe('validateProfileDraft：必填项', () => {
  it('名称、地址和模型名缺失时分别报错', () => {
    const issues = validateProfileDraft(draft({ name: '   ', url: '', model: '' }));

    expect(issues.map((issue) => issue.field)).toEqual(['name', 'url', 'model']);
    for (const issue of issues) expect(issue.message.length).toBeGreaterThan(0);
  });

  it('API Key 可以留空', () => {
    expect(validateProfileDraft(draft({ apiKey: '' }))).toEqual([]);
  });
});

describe('validateProfileDraft：请求地址规则', () => {
  it('接受 HTTPS 远程地址', () => {
    expect(fields(draft({ url: 'https://api.example.com/v1/chat/completions' }))).toEqual([]);
    expect(fields(draft({ url: 'http://localhost:11434/v1/chat/completions' }))).toEqual([]);
    expect(fields(draft({ url: 'http://127.0.0.1:8080/v1/chat/completions' }))).toEqual([]);
  });

  it('拒绝远程 HTTP 地址', () => {
    const issues = validateProfileDraft(draft({ url: 'http://api.example.com/v1/chat/completions' }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('url');
    expect(issues[0]?.message).toContain('HTTPS');
  });

  it('拒绝不是完整 URL 的地址', () => {
    expect(fields(draft({ url: 'api.example.com/v1/chat/completions' }))).toEqual(['url']);
    expect(fields(draft({ url: 'ftp://api.example.com/v1' }))).toEqual(['url']);
  });
});

describe('validateProfileDraft：认证冲突', () => {
  it('API Key 与自定义 Authorization 同时存在时要求二选一', () => {
    const issues = validateProfileDraft(
      draft({ apiKey: API_KEY, headers: { Authorization: 'Bearer other-token' } }),
    );

    expect(issues.some((issue) => issue.field === 'apiKey' || issue.field === 'headers')).toBe(true);
    expect(issues.every((issue) => !issue.message.includes(API_KEY))).toBe(true);
    expect(issues.every((issue) => !issue.message.includes('other-token'))).toBe(true);
  });

  it('留空 API Key 并使用自定义认证请求头时通过', () => {
    expect(
      validateProfileDraft(draft({ apiKey: '', headers: { authorization: 'Bearer other-token' } })),
    ).toEqual([]);
  });
});

describe('validateProfileDraft：额外请求参数', () => {
  it('新配置默认显式关闭思考', () => {
    expect(createProfileDraft().extraParams).toEqual({ reasoning_effort: 'none' });
    expect(DEFAULT_EXTRA_PARAMS).toEqual({ reasoning_effort: 'none' });
  });

  it('允许任意自定义参数并与默认值共存', () => {
    expect(validateProfileDraft(draft({ extraParams: { reasoning_effort: 'none', temperature: 0.2 } }))).toEqual([]);
  });

  it('拒绝覆盖保留字段 model、messages 和 stream', () => {
    for (const field of ['model', 'messages', 'stream']) {
      const issues = validateProfileDraft(draft({ extraParams: { [field]: 'x' } }));

      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe('extraParams');
      expect(issues[0]?.message).toContain(field);
    }
  });
});

describe('validateProfileDraft：自定义请求头', () => {
  it('接受普通自定义请求头', () => {
    expect(validateProfileDraft(draft({ headers: { 'X-Tenant': 'team-a' } }))).toEqual([]);
  });

  it('拒绝浏览器控制或禁止设置的请求头，并只回显头名', () => {
    for (const name of ['Host', 'User-Agent', 'Cookie', 'Sec-Fetch-Site', 'Proxy-Authorization']) {
      const issues = validateProfileDraft(draft({ headers: { [name]: 'value-should-not-leak' } }));

      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe('headers');
      expect(issues[0]?.message).toContain(name);
      expect(issues[0]?.message).not.toContain('value-should-not-leak');
    }
  });

  it('拒绝空的请求头名和含换行的值', () => {
    expect(fields(draft({ headers: { ['  ']: 'v' } }))).toEqual(['headers']);
    expect(fields(draft({ headers: { 'X-Bad': 'line1\r\nInjected: 1' } }))).toEqual(['headers']);
  });
});

describe('validateProfileDraft：任务运行参数', () => {
  it('默认并发 3、超时 60 秒、重试 2 次', () => {
    expect(createProfileDraft().runtime).toEqual({ concurrency: 3, timeoutMs: 60_000, retryCount: 2 });
    expect(validateProfileDraft(draft())).toEqual([]);
  });

  it('允许调整并发、超时和重试次数', () => {
    expect(
      validateProfileDraft(draft({ runtime: { concurrency: 8, timeoutMs: 120_000, retryCount: 5 } })),
    ).toEqual([]);
    expect(
      validateProfileDraft(draft({ runtime: { concurrency: 1, timeoutMs: 1000, retryCount: 0 } })),
    ).toEqual([]);
  });

  it('越界或非整数的运行参数被拒绝', () => {
    expect(fields(draft({ runtime: { ...DEFAULT_RUNTIME_SETTINGS, concurrency: 0 } }))).toEqual(['concurrency']);
    expect(fields(draft({ runtime: { ...DEFAULT_RUNTIME_SETTINGS, concurrency: 17 } }))).toEqual(['concurrency']);
    expect(fields(draft({ runtime: { ...DEFAULT_RUNTIME_SETTINGS, concurrency: 2.5 } }))).toEqual(['concurrency']);
    expect(fields(draft({ runtime: { ...DEFAULT_RUNTIME_SETTINGS, timeoutMs: 0 } }))).toEqual(['timeoutMs']);
    expect(fields(draft({ runtime: { ...DEFAULT_RUNTIME_SETTINGS, timeoutMs: 601_000 } }))).toEqual(['timeoutMs']);
    expect(fields(draft({ runtime: { ...DEFAULT_RUNTIME_SETTINGS, retryCount: 6 } }))).toEqual(['retryCount']);
  });
});

describe('parseExtraParamsJson', () => {
  it('把 JSON 对象解析为额外请求参数', () => {
    const result = parseExtraParamsJson('{"reasoning_effort":"none","temperature":0.2}');

    expect(result).toEqual({ ok: true, value: { reasoning_effort: 'none', temperature: 0.2 } });
  });

  it('空内容等价于没有额外参数', () => {
    expect(parseExtraParamsJson('   ')).toEqual({ ok: true, value: {} });
  });

  it('非法 JSON 给出可理解错误', () => {
    const result = parseExtraParamsJson('{reasoning_effort: none}');

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('JSON');
  });

  it('非对象 JSON 被拒绝', () => {
    for (const text of ['[]', '"text"', '42', 'null', 'true']) {
      const result = parseExtraParamsJson(text);
      expect(result.ok).toBe(false);
      expect(result.ok ? '' : result.message).toContain('对象');
    }
  });

  it('保留字段在解析阶段就被拒绝', () => {
    const result = parseExtraParamsJson('{"stream":true}');

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('stream');
  });
});

describe('parseHeaderLines', () => {
  it('逐行解析「名称: 值」，忽略空行', () => {
    const result = parseHeaderLines('X-Tenant: team-a\n\nAuthorization: Bearer token-1234\n');

    expect(result).toEqual({
      ok: true,
      value: { 'X-Tenant': 'team-a', Authorization: 'Bearer token-1234' },
    });
  });

  it('空内容表示没有自定义请求头', () => {
    expect(parseHeaderLines('   \n')).toEqual({ ok: true, value: {} });
  });

  it('缺少冒号的行按行号报错，不回显内容', () => {
    const result = parseHeaderLines('X-Ok: 1\nsecret-token-without-colon');

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('第 2 行');
    expect(result.ok ? '' : result.message).not.toContain('secret-token-without-colon');
  });

  it('重复的请求头名被拒绝', () => {
    const result = parseHeaderLines('X-Tenant: a\nx-tenant: b');

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('X-Tenant');
  });

  it('浏览器禁止设置的请求头被拒绝', () => {
    const result = parseHeaderLines('Host: example.com');

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('Host');
  });

  it('序列化与解析往返一致', () => {
    const headers = { 'X-Tenant': 'team-a', Authorization: 'Bearer token-1234' };

    expect(parseHeaderLines(serializeHeaderLines(headers))).toEqual({ ok: true, value: headers });
  });
});
