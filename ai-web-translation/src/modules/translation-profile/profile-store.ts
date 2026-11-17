import { createProfileId, type ProfileId } from '@/shared/ids';
import { createSerialQueue, type SerialQueue } from '@/shared/serial-queue';
import type { KeyValueStorage } from '../site-preferences/key-value-storage';
import {
  clampInteger,
  DEFAULT_EXTRA_PARAMS,
  DEFAULT_RUNTIME_SETTINGS,
  normalizeHeaders,
  normalizeProfileDraft,
  RUNTIME_LIMITS,
  type TranslationProfile,
  type TranslationProfileDraft,
} from './profile';
import { validateProfileDraft, type ProfileValidationIssue } from './profile-validation';

export const STORED_PROFILES_KEY = 'aiwt.translationProfiles';

export interface TranslationProfileState {
  profiles: TranslationProfile[];
  /** 始终指向一份已存在的配置，或在没有配置时为 null。 */
  defaultProfileId: ProfileId | null;
}

export const EMPTY_PROFILE_STATE: TranslationProfileState = { profiles: [], defaultProfileId: null };

/** 配置在写入前没有通过校验；错误只携带字段与原因。 */
export class InvalidProfileError extends Error {
  constructor(readonly issues: readonly ProfileValidationIssue[]) {
    super(issues[0]?.message ?? '翻译服务配置不合法。');
    this.name = 'InvalidProfileError';
  }
}

/** 配置在仓库中的读写能力；设置页使用，页面侧只能用 TranslationProfileCatalog。 */
export interface TranslationProfileRepository {
  read(): Promise<TranslationProfileState>;
  list(): Promise<TranslationProfile[]>;
  find(id: ProfileId): Promise<TranslationProfile | undefined>;
  create(draft: TranslationProfileDraft): Promise<TranslationProfile>;
  update(id: ProfileId, draft: TranslationProfileDraft): Promise<TranslationProfile>;
  remove(id: ProfileId): Promise<void>;
  findDefault(): Promise<TranslationProfile | null>;
  setDefault(id: ProfileId): Promise<void>;
  watch(listener: (state: TranslationProfileState) => void): () => void;
}

/**
 * 本机保存翻译服务配置与默认选择。
 * 写入串行执行，避免同一设置页里连续保存时互相覆盖。
 */
export class StoredTranslationProfiles implements TranslationProfileRepository {
  private readonly queue: SerialQueue = createSerialQueue();

  constructor(private readonly storage: KeyValueStorage) {}

  async read(): Promise<TranslationProfileState> {
    return normalizeProfileState(await this.storage.read<unknown>(STORED_PROFILES_KEY));
  }

  async list(): Promise<TranslationProfile[]> {
    return (await this.read()).profiles;
  }

  async find(id: ProfileId): Promise<TranslationProfile | undefined> {
    return (await this.read()).profiles.find((profile) => profile.id === id);
  }

  async findDefault(): Promise<TranslationProfile | null> {
    const state = await this.read();
    return state.profiles.find((profile) => profile.id === state.defaultProfileId) ?? null;
  }

  async create(draft: TranslationProfileDraft): Promise<TranslationProfile> {
    const normalized = prepareDraft(draft);

    return this.queue.run(async () => {
      const state = await this.read();
      const profile: TranslationProfile = { ...normalized, id: createProfileId() };
      await this.write({
        profiles: [...state.profiles, profile],
        defaultProfileId: state.defaultProfileId ?? profile.id,
      });
      return profile;
    });
  }

  async update(id: ProfileId, draft: TranslationProfileDraft): Promise<TranslationProfile> {
    const normalized = prepareDraft(draft);

    return this.queue.run(async () => {
      const state = await this.read();
      if (!state.profiles.some((profile) => profile.id === id)) {
        throw new Error('翻译服务配置不存在。');
      }
      const profile: TranslationProfile = { ...normalized, id };
      await this.write({
        profiles: state.profiles.map((item) => (item.id === id ? profile : item)),
        defaultProfileId: state.defaultProfileId,
      });
      return profile;
    });
  }

  async remove(id: ProfileId): Promise<void> {
    await this.queue.run(async () => {
      const state = await this.read();
      const profiles = state.profiles.filter((profile) => profile.id !== id);
      // 默认选择不允许指向已删除的配置：删除默认配置时回落到剩余的第一份配置。
      const defaultProfileId =
        state.defaultProfileId !== null && profiles.some((profile) => profile.id === state.defaultProfileId)
          ? state.defaultProfileId
          : (profiles[0]?.id ?? null);
      await this.write({ profiles, defaultProfileId });
    });
  }

  async setDefault(id: ProfileId): Promise<void> {
    await this.queue.run(async () => {
      const state = await this.read();
      if (!state.profiles.some((profile) => profile.id === id)) {
        throw new Error('翻译服务配置不存在。');
      }
      await this.write({ profiles: state.profiles, defaultProfileId: id });
    });
  }

  watch(listener: (state: TranslationProfileState) => void): () => void {
    return this.storage.watch(STORED_PROFILES_KEY, (value) => listener(normalizeProfileState(value)));
  }

  private async write(state: TranslationProfileState): Promise<void> {
    await this.storage.write(STORED_PROFILES_KEY, state);
  }

}

function prepareDraft(draft: TranslationProfileDraft): TranslationProfileDraft {
  const issues = validateProfileDraft(draft);
  if (issues.length > 0) throw new InvalidProfileError(issues);
  return normalizeProfileDraft(draft);
}

/**
 * 容忍损坏或旧版本数据：丢弃无法识别的配置，
 * 并在默认选择失效时回落到第一份有效配置。
 */
export function normalizeProfileState(value: unknown): TranslationProfileState {
  if (typeof value !== 'object' || value === null) return { profiles: [], defaultProfileId: null };

  const record = value as Record<string, unknown>;
  const profiles: TranslationProfile[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(record.profiles) ? record.profiles : []) {
    const profile = normalizeStoredProfile(item);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }

  const savedDefault = typeof record.defaultProfileId === 'string' ? record.defaultProfileId : null;
  const defaultProfileId = savedDefault !== null && seen.has(savedDefault) ? savedDefault : (profiles[0]?.id ?? null);

  return { profiles, defaultProfileId };
}

function normalizeStoredProfile(value: unknown): TranslationProfile | null {
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;

  const extraParams =
    typeof record.extraParams === 'object' && record.extraParams !== null && !Array.isArray(record.extraParams)
      ? { ...(record.extraParams as Record<string, unknown>) }
      : { ...DEFAULT_EXTRA_PARAMS };

  const runtimeSource =
    typeof record.runtime === 'object' && record.runtime !== null ? (record.runtime as Record<string, unknown>) : {};

  return {
    id,
    name: typeof record.name === 'string' ? record.name : '',
    url: typeof record.url === 'string' ? record.url : '',
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    model: typeof record.model === 'string' ? record.model : '',
    headers: normalizeHeaders(record.headers),
    extraParams,
    runtime: {
      concurrency: clampInteger(
        runtimeSource.concurrency,
        DEFAULT_RUNTIME_SETTINGS.concurrency,
        RUNTIME_LIMITS.concurrency.min,
        RUNTIME_LIMITS.concurrency.max,
      ),
      timeoutMs: clampInteger(
        runtimeSource.timeoutMs,
        DEFAULT_RUNTIME_SETTINGS.timeoutMs,
        RUNTIME_LIMITS.timeoutSeconds.min * 1000,
        RUNTIME_LIMITS.timeoutSeconds.max * 1000,
      ),
      retryCount: clampInteger(
        runtimeSource.retryCount,
        DEFAULT_RUNTIME_SETTINGS.retryCount,
        RUNTIME_LIMITS.retryCount.min,
        RUNTIME_LIMITS.retryCount.max,
      ),
    },
  };
}
