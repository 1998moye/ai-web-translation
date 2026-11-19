import { browser } from 'wxt/browser';

/** 只暴露本机键值存储的最小能力，便于测试替换。 */
export interface KeyValueStorage {
  read<T>(key: string): Promise<T | undefined>;
  write(key: string, value: unknown): Promise<void>;
  /** 监听该键的变化，返回取消监听的函数。 */
  watch(key: string, listener: (value: unknown) => void): () => void;
}

export function createChromeStorage(): KeyValueStorage {
  return {
    async read<T>(key: string): Promise<T | undefined> {
      const stored = await browser.storage.local.get(key);
      return stored[key] as T | undefined;
    },
    async write(key: string, value: unknown): Promise<void> {
      await browser.storage.local.set({ [key]: value });
    },
    watch(key, listener) {
      const handler = (changes: Record<string, { newValue?: unknown }>, areaName: string): void => {
        if (areaName !== 'local') return;
        if (!(key in changes)) return;
        listener(changes[key]?.newValue);
      };
      browser.storage.onChanged.addListener(handler);
      return () => browser.storage.onChanged.removeListener(handler);
    },
  };
}
