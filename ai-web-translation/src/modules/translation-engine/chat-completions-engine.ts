import { createSanitizedError, sanitizeError } from '../translation-contract/sanitized-error';
import type { StartTranslationRequest, TranslationEngine } from '../translation-contract/translation-engine';
import type { SanitizedTranslationError, TranslationEvent, TranslationUnit } from '../translation-contract/types';
import {
  CACHE_SOURCE_LANGUAGE,
  CACHE_TARGET_LANGUAGE,
  type TranslationCacheDescriptor,
} from '../translation-cache/cache-key';
import type { TranslationCache } from '../translation-cache/translation-cache';
import { buildChatCompletionRequest } from '../translation-chat-completions/request';
import { extractCompletionContent, parseTranslationResult } from '../translation-chat-completions/response';
import type { HttpAdapter } from '../translation-chat-completions/http-adapter';
import type { TranslationProfile } from '../translation-profile/profile';
import type { TranslationProfileRepository } from '../translation-profile/profile-store';
import type { TranslationPromptRepository } from '../translation-prompt/prompt-store';
import { groupUnitsIntoBatches } from './translation-batches';

export interface ChatCompletionsEngineDeps {
  http: HttpAdapter;
  profiles: TranslationProfileRepository;
  prompts: TranslationPromptRepository;
  cache: TranslationCache;
}

/** 会话首次请求时固化的配置与提示词；同一会话后续批次继续使用。 */
interface SessionSnapshot {
  profile: TranslationProfile;
  prompt: string;
}

/** 会话快照上限：避免长期运行的后台堆积已经结束的会话。 */
const MAX_SESSION_SNAPSHOTS = 50;

/**
 * 生产 Translation Engine 实现（在后台运行）。
 *
 * 调用方只看到开始翻译与取消会话；请求构造、提示词、分批、缓存、
 * 单元 ID 校验、错误脱敏、配置快照和取消都在这里隐藏。
 */
export class ChatCompletionsTranslationEngine implements TranslationEngine {
  private readonly sessions = new Map<string, AbortController>();
  private readonly snapshots = new Map<string, SessionSnapshot>();

  constructor(private readonly deps: ChatCompletionsEngineDeps) {}

  translate(request: StartTranslationRequest): AsyncIterable<TranslationEvent> {
    return this.run(request);
  }

  async cancelSession(sessionId: string): Promise<void> {
    const controller = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    this.snapshots.delete(sessionId);
    controller?.abort();
  }

  private async *run(request: StartTranslationRequest): AsyncGenerator<TranslationEvent> {
    const controller = new AbortController();
    this.sessions.set(request.sessionId, controller);

    try {
      const snapshot = await this.resolveSnapshot(request.sessionId, request.profileId);
      if (!snapshot) {
        yield* failAll(request, createSanitizedError('profile-unavailable'));
        yield completed(request);
        return;
      }

      // 缓存命中直接返回，不进入分批也不占用请求。
      const misses: TranslationUnit[] = [];
      for (const unit of request.units) {
        const cached = await this.deps.cache.get(this.describe(snapshot, unit.text));
        if (cached === null) {
          misses.push(unit);
          continue;
        }
        yield succeeded(request, unit.id, cached);
      }

      for (const batch of groupUnitsIntoBatches(misses)) {
        if (controller.signal.aborted) return;
        yield* this.translateBatch({ request, batch, snapshot, signal: controller.signal });
      }

      yield completed(request);
    } catch (error) {
      // 取消后的失败不再上报：调用方已经丢弃了这个会话。
      if (controller.signal.aborted) return;

      yield* failAll(request, sanitizeError(error));
      yield completed(request);
    } finally {
      this.sessions.delete(request.sessionId);
    }
  }

  /** 单个批次的失败只影响该批次的单元，已经成功的批次保持可用。 */
  private async *translateBatch(input: {
    request: StartTranslationRequest;
    batch: readonly TranslationUnit[];
    snapshot: SessionSnapshot;
    signal: AbortSignal;
  }): AsyncGenerator<TranslationEvent> {
    const { request, batch, snapshot, signal } = input;

    try {
      const outcome = await this.deps.http.send({
        ...buildChatCompletionRequest({
          profile: snapshot.profile,
          prompt: snapshot.prompt,
          units: batch,
          ...(request.context ? { context: request.context } : {}),
        }),
        signal,
      });

      if (signal.aborted) return;

      const content = extractCompletionContent(outcome);
      const parsed = parseTranslationResult(
        content,
        batch.map((unit) => unit.id),
      );

      for (const unit of batch) {
        const text = parsed.translations.get(unit.id);
        if (text === undefined) {
          yield failed(request, unit.id, createSanitizedError('response-invalid'));
          continue;
        }
        // 只有通过单元 ID 校验的译文才写入缓存。
        await this.deps.cache.put(this.describe(snapshot, unit.text), text);
        yield succeeded(request, unit.id, text);
      }
    } catch (error) {
      if (signal.aborted) return;

      const sanitized = sanitizeError(error);
      for (const unit of batch) yield failed(request, unit.id, sanitized);
    }
  }

  private describe(snapshot: SessionSnapshot, sourceText: string): TranslationCacheDescriptor {
    return {
      sourceText,
      sourceLanguage: CACHE_SOURCE_LANGUAGE,
      targetLanguage: CACHE_TARGET_LANGUAGE,
      serviceUrl: snapshot.profile.url,
      model: snapshot.profile.model,
      prompt: snapshot.prompt,
      extraParams: snapshot.profile.extraParams,
    };
  }

  private async resolveSnapshot(sessionId: string, profileId: string): Promise<SessionSnapshot | null> {
    const existing = this.snapshots.get(sessionId);
    if (existing) return existing;

    const profile = await this.deps.profiles.find(profileId);
    if (!profile) return null;

    const snapshot: SessionSnapshot = { profile, prompt: await this.deps.prompts.read() };
    if (this.snapshots.size >= MAX_SESSION_SNAPSHOTS) {
      const oldest = this.snapshots.keys().next();
      if (!oldest.done) this.snapshots.delete(oldest.value);
    }
    this.snapshots.set(sessionId, snapshot);
    return snapshot;
  }
}

function* failAll(
  request: StartTranslationRequest,
  error: SanitizedTranslationError,
): Generator<TranslationEvent> {
  for (const unit of request.units) yield failed(request, unit.id, error);
}

function succeeded(
  request: StartTranslationRequest,
  unitId: string,
  text: string,
): TranslationEvent {
  return {
    type: 'unit-succeeded',
    sessionId: request.sessionId,
    requestId: request.requestId,
    unitId,
    text,
  };
}

function failed(
  request: StartTranslationRequest,
  unitId: string,
  error: SanitizedTranslationError,
): TranslationEvent {
  return {
    type: 'unit-failed',
    sessionId: request.sessionId,
    requestId: request.requestId,
    unitId,
    error,
  };
}

function completed(request: StartTranslationRequest): TranslationEvent {
  return { type: 'request-completed', sessionId: request.sessionId, requestId: request.requestId };
}
