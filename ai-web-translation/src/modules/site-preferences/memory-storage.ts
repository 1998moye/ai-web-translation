import type { KeyValueStorage } from './key-value-storage';

/** 测试替身：不依赖浏览器存储，行为与 chrome.storage.local 的单键读写一致。 */
export class MemoryKeyValueStorage implements KeyValueStorage {
  private readonly values = new Map<string, unknown>();
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();

  async read<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    for (const listener of this.listeners.get(key) ?? []) listener(value);
  }

  watch(key: string, listener: (value: unknown) => void): () => void {
    let listeners = this.listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => listeners?.delete(listener);
  }
}
