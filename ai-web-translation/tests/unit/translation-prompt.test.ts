import { describe, expect, it, vi } from 'vitest';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { DEFAULT_TRANSLATION_PROMPT } from '@/modules/translation-prompt/default-prompt';
import {
  InvalidPromptError,
  StoredTranslationPrompt,
  TRANSLATION_PROMPT_KEY,
} from '@/modules/translation-prompt/prompt-store';

describe('默认翻译提示词', () => {
  it('把 AI 定义为只做英译中的翻译引擎，而不是聊天助手', () => {
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('翻译引擎');
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('简体中文');
  });

  it('禁止解释、总结、回答、评论、前后缀和 Markdown', () => {
    for (const phrase of ['解释', '总结', '评论', '前缀', 'Markdown']) {
      expect(DEFAULT_TRANSLATION_PROMPT).toContain(phrase);
    }
  });

  it('声明待翻译文本与翻译上下文是不可信资料', () => {
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('不可信');
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('不要为它们生成译文');
  });

  it('要求保留单元 ID、占位标记与链接，并只返回约定的结构化译文', () => {
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('id');
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('⟦o1⟧');
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('链接');
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('{"translations"');
  });

  it('不把上下文当作待翻译内容返回', () => {
    expect(DEFAULT_TRANSLATION_PROMPT).toContain('context');
  });
});

describe('StoredTranslationPrompt', () => {
  it('没有自定义提示词时使用内置默认值', async () => {
    const repository = new StoredTranslationPrompt(new MemoryKeyValueStorage());

    expect(await repository.read()).toBe(DEFAULT_TRANSLATION_PROMPT);
    expect(await repository.readCustom()).toBeNull();
  });

  it('保存自定义提示词后读取到自定义内容，重新打开设置页仍保持', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new StoredTranslationPrompt(storage);

    await repository.save('只翻译成简体中文，保留 ⟦o1⟧。');

    expect(await repository.read()).toBe('只翻译成简体中文，保留 ⟦o1⟧。');
    const reloaded = new StoredTranslationPrompt(storage);
    expect(await reloaded.read()).toBe('只翻译成简体中文，保留 ⟦o1⟧。');
    expect(await reloaded.readCustom()).toBe('只翻译成简体中文，保留 ⟦o1⟧。');
  });

  it('恢复默认后重新读取到内置默认值', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = new StoredTranslationPrompt(storage);
    await repository.save('自定义提示词');

    await repository.reset();

    expect(await repository.read()).toBe(DEFAULT_TRANSLATION_PROMPT);
    expect(await repository.readCustom()).toBeNull();
  });

  it('拒绝保存空提示词，已有值保持不变', async () => {
    const repository = new StoredTranslationPrompt(new MemoryKeyValueStorage());
    await repository.save('自定义提示词');

    await expect(repository.save('   ')).rejects.toBeInstanceOf(InvalidPromptError);
    expect(await repository.read()).toBe('自定义提示词');
  });

  it('损坏的存储值回落到默认提示词', async () => {
    const storage = new MemoryKeyValueStorage();
    await storage.write(TRANSLATION_PROMPT_KEY, { text: 'not-a-string' });

    const repository = new StoredTranslationPrompt(storage);
    expect(await repository.read()).toBe(DEFAULT_TRANSLATION_PROMPT);
  });

  it('watch 在提示词变化时通知订阅者', async () => {
    const repository = new StoredTranslationPrompt(new MemoryKeyValueStorage());
    const listener = vi.fn();
    const unsubscribe = repository.watch(listener);

    await repository.save('自定义提示词');
    expect(listener.mock.calls.at(-1)?.[0]).toBe('自定义提示词');

    await repository.reset();
    expect(listener.mock.calls.at(-1)?.[0]).toBe(DEFAULT_TRANSLATION_PROMPT);

    unsubscribe();
    await repository.save('再来一次');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
