import { describe, expect, it } from 'vitest';
import {
  createCacheKey,
  type TranslationCacheDescriptor,
} from '@/modules/translation-cache/cache-key';

const DESCRIPTOR: TranslationCacheDescriptor = {
  sourceText: 'The quick brown fox jumps over the lazy dog.',
  sourceLanguage: 'en',
  targetLanguage: 'zh-CN',
  serviceUrl: 'https://api.example.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  prompt: '把英文翻译成简体中文。',
  extraParams: { reasoning_effort: 'none' },
};

function keyOf(overrides: Partial<TranslationCacheDescriptor> = {}): string {
  return createCacheKey({ ...DESCRIPTOR, ...overrides });
}

describe('createCacheKey', () => {
  it('相同原文与相同配置得到相同键', () => {
    expect(keyOf()).toBe(keyOf());
    expect(keyOf({ extraParams: { reasoning_effort: 'none' } })).toBe(keyOf());
  });

  it('规范化原文：空白差异不影响命中', () => {
    expect(keyOf({ sourceText: '  The   quick brown fox\n jumps over the lazy dog. ' })).toBe(keyOf());
  });

  it('翻译服务、模型、提示词或请求参数变化会产生新键', () => {
    const base = keyOf();
    expect(keyOf({ serviceUrl: 'https://other.example.com/v1/chat/completions' })).not.toBe(base);
    expect(keyOf({ model: 'gpt-4.1' })).not.toBe(base);
    expect(keyOf({ prompt: '换个提示词。' })).not.toBe(base);
    expect(keyOf({ extraParams: { reasoning_effort: 'high' } })).not.toBe(base);
    expect(keyOf({ extraParams: { reasoning_effort: 'none', temperature: 0.2 } })).not.toBe(base);
  });

  it('原文不同则键不同', () => {
    expect(keyOf({ sourceText: 'Another sentence.' })).not.toBe(keyOf());
  });

  it('请求参数的对象键顺序不影响键', () => {
    const first = keyOf({ extraParams: { temperature: 0.2, reasoning_effort: 'none' } });
    const second = keyOf({ extraParams: { reasoning_effort: 'none', temperature: 0.2 } });
    expect(first).toBe(second);
  });

  it('语言方向参与键', () => {
    expect(keyOf({ targetLanguage: 'ja' })).not.toBe(keyOf());
  });

  it('缓存键不包含 API Key', () => {
    const key = keyOf();
    expect(key).not.toContain('sk-');
    expect(key).not.toContain(DESCRIPTOR.serviceUrl);
  });
});
