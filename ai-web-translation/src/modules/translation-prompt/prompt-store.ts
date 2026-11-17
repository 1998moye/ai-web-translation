import type { KeyValueStorage } from '../site-preferences/key-value-storage';
import { DEFAULT_TRANSLATION_PROMPT } from './default-prompt';

export const TRANSLATION_PROMPT_KEY = 'aiwt.translationPrompt';

/** 保存的提示词不合法；消息可直接展示给用户。 */
export class InvalidPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPromptError';
  }
}

/**
 * 翻译提示词的读写能力。设置页使用完整读写；
 * Translation Engine 只通过 read() 取当前生效的提示词。
 */
export interface TranslationPromptRepository {
  /** 当前生效的提示词：自定义值，或内置默认值。 */
  read(): Promise<string>;
  /** 用户自定义的提示词；没有自定义时为 null。 */
  readCustom(): Promise<string | null>;
  save(text: string): Promise<void>;
  reset(): Promise<void>;
  watch(listener: (prompt: string) => void): () => void;
}

export class StoredTranslationPrompt implements TranslationPromptRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async read(): Promise<string> {
    return (await this.readCustom()) ?? DEFAULT_TRANSLATION_PROMPT;
  }

  async readCustom(): Promise<string | null> {
    return normalizePromptOverride(await this.storage.read<unknown>(TRANSLATION_PROMPT_KEY));
  }

  async save(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new InvalidPromptError('翻译提示词不能为空。可以点「恢复默认」回到内置提示词。');
    }
    await this.storage.write(TRANSLATION_PROMPT_KEY, trimmed);
  }

  async reset(): Promise<void> {
    // 写入 null 而不是删除键：与 chrome.storage.local 的 watch 通知保持一致。
    await this.storage.write(TRANSLATION_PROMPT_KEY, null);
  }

  watch(listener: (prompt: string) => void): () => void {
    return this.storage.watch(TRANSLATION_PROMPT_KEY, (value) => {
      listener(normalizePromptOverride(value) ?? DEFAULT_TRANSLATION_PROMPT);
    });
  }
}

export function normalizePromptOverride(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
