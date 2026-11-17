import type { KeyValueStorage } from '../site-preferences/key-value-storage';
import { createCacheKey, type TranslationCacheDescriptor } from './cache-key';

export const TRANSLATION_CACHE_KEY = 'aiwt.translationCache';

/** 单条缓存记录：保留原文用于逐字校验，避免哈希碰撞导致错配。 */
interface CacheEntry {
  source: string;
  text: string;
  storedAt: number;
}

interface CacheState {
  entries: Record<string, CacheEntry>;
}

export interface TranslationCacheOptions {
  /** 条目上限：chrome.storage.local 有配额，超过后淘汰最旧条目。 */
  maxEntries?: number;
  now?: () => number;
}

export const DEFAULT_MAX_CACHE_ENTRIES = 2000;

/**
 * 本机译文缓存。
 * 键包含翻译服务、模型、提示词与有效请求参数，读取时再校验原文，
 * 因此不同配置或不同原文都不会拿到别人的译文。
 */
export interface TranslationCache {
  get(descriptor: TranslationCacheDescriptor): Promise<string | null>;
  put(descriptor: TranslationCacheDescriptor, text: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
}

export class StoredTranslationCache implements TranslationCache {
  private readonly maxEntries: number;
  private readonly now: () => number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: KeyValueStorage,
    options: TranslationCacheOptions = {},
  ) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  async get(descriptor: TranslationCacheDescriptor): Promise<string | null> {
    const state = await this.readState();
    const entry = state.entries[createCacheKey(descriptor)];
    if (!entry) return null;
    // 哈希碰撞或旧数据残留时不能套用别的原文译文。
    if (entry.source !== descriptor.sourceText.trim()) return null;
    return entry.text;
  }

  async put(descriptor: TranslationCacheDescriptor, text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    await this.enqueue(async () => {
      const state = await this.readState();
      const key = createCacheKey(descriptor);
      state.entries[key] = { source: descriptor.sourceText.trim(), text: trimmed, storedAt: this.now() };
      await this.storage.write(TRANSLATION_CACHE_KEY, prune(state, this.maxEntries));
    });
  }

  async clear(): Promise<void> {
    await this.enqueue(async () => {
      await this.storage.write(TRANSLATION_CACHE_KEY, { entries: {} } satisfies CacheState);
    });
  }

  async count(): Promise<number> {
    return Object.keys((await this.readState()).entries).length;
  }

  private async readState(): Promise<CacheState> {
    return normalizeCacheState(await this.storage.read<unknown>(TRANSLATION_CACHE_KEY));
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export function normalizeCacheState(value: unknown): CacheState {
  const entries: Record<string, CacheEntry> = {};
  if (typeof value !== 'object' || value === null) return { entries };

  const record = (value as Record<string, unknown>).entries;
  if (typeof record !== 'object' || record === null) return { entries };

  for (const [key, item] of Object.entries(record as Record<string, unknown>)) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.source !== 'string' || typeof entry.text !== 'string') continue;
    if (!entry.source || !entry.text.trim()) continue;
    entries[key] = {
      source: entry.source,
      text: entry.text,
      storedAt: typeof entry.storedAt === 'number' ? entry.storedAt : 0,
    };
  }

  return { entries };
}

function prune(state: CacheState, maxEntries: number): CacheState {
  const keys = Object.keys(state.entries);
  if (keys.length <= maxEntries) return state;

  keys.sort((left, right) => state.entries[left]!.storedAt - state.entries[right]!.storedAt);
  const removed = new Set(keys.slice(0, keys.length - maxEntries));
  const entries: Record<string, CacheEntry> = {};
  for (const key of keys) {
    if (!removed.has(key)) entries[key] = state.entries[key]!;
  }
  return { entries };
}
