import { AsyncQueue } from '@/shared/async-queue';
import { createSanitizedError, sanitizeError } from '../translation-contract/sanitized-error';
import type { StartTranslationRequest, TranslationEngine } from '../translation-contract/translation-engine';
import type {
  SanitizedTranslationError,
  TranslationErrorCode,
  TranslationEvent,
  TranslationUnit,
} from '../translation-contract/types';
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
import { createConcurrencyLimiter, type ConcurrencyLimiter } from './concurrency-limiter';
import { groupUnitsIntoBatches } from './translation-batches';

export interface ChatCompletionsEngineDeps {
  http: HttpAdapter;
  profiles: TranslationProfileRepository;
  prompts: TranslationPromptRepository;
  cache: TranslationCache;
  /** 重试等待；测试可以注入即时实现。 */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** 会话首次请求时固化的配置与提示词；同一会话后续批次继续使用。 */
interface SessionSnapshot {
  profile: TranslationProfile;
  prompt: string;
}

interface AttemptResult {
  events: TranslationEvent[];
  retryable: boolean;
  retryAfterMs?: number;
}

/** 只有网络错误、限流与服务端故障值得重试；参数与认证错误重试也不会成功。 */
const RETRYABLE_CODES: ReadonlySet<TranslationErrorCode> = new Set(['network', 'rate-limited', 'server']);

/** 会话快照上限：避免长期运行的后台堆积已经结束的会话。 */
const MAX_SESSION_SNAPSHOTS = 50;
const BACKOFF_BASE_MS = 300;
const BACKOFF_MAX_MS = 2000;

/**
 * 生产 Translation Engine 实现（在后台运行）。
 *
 * 调用方只看到开始翻译与取消会话；请求构造、提示词、分批、缓存、并发、超时、
 * 重试、配置快照与取消都在这里隐藏，配置与密钥不会离开后台。
 */
export class ChatCompletionsTranslationEngine implements TranslationEngine {
  private readonly sessions = new Map<string, AbortController>();
  private readonly snapshots = new Map<string, SessionSnapshot>();
  private readonly limiters = new Map<string, ConcurrencyLimiter>();

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

      // 缓存命中直接返回：不进入分批，也不占用翻译服务并发。
      const misses: TranslationUnit[] = [];
      for (const unit of request.units) {
        const cached = await this.deps.cache.get(this.cacheDescriptorFor(snapshot, unit.text));
        if (cached === null) {
          misses.push(unit);
          continue;
        }
        yield succeeded(request, unit.id, cached);
      }

      const batches = groupUnitsIntoBatches(misses);
      if (batches.length > 0) {
        yield* this.runBatches({ request, batches, snapshot, signal: controller.signal });
      }

      if (!controller.signal.aborted) yield completed(request);
    } catch (error) {
      // 取消后的失败不再上报：调用方已经丢弃了这个会话。
      if (controller.signal.aborted) return;

      yield* failAll(request, sanitizeError(error));
      yield completed(request);
    } finally {
      this.sessions.delete(request.sessionId);
    }
  }

  /** 批次并发执行，事件按完成顺序推出；成功批次先显示。 */
  private async *runBatches(input: {
    request: StartTranslationRequest;
    batches: readonly TranslationUnit[][];
    snapshot: SessionSnapshot;
    signal: AbortSignal;
  }): AsyncGenerator<TranslationEvent> {
    const limiter = this.limiterFor(input.snapshot.profile);
    const queue = new AsyncQueue<TranslationEvent>();

    const tasks = input.batches.map((batch) =>
      limiter
        .run(() =>
          this.translateBatch({
            request: input.request,
            batch,
            snapshot: input.snapshot,
            signal: input.signal,
          }),
        )
        .then((events) => {
          for (const event of events) queue.push(event);
        })
        .catch(() => undefined),
    );

    void Promise.all(tasks).then(() => queue.end());
    for await (const event of queue) yield event;
  }

  /** 单个批次：按配置重试，成功译文写入缓存；失败只影响该批次单元。 */
  private async translateBatch(input: {
    request: StartTranslationRequest;
    batch: readonly TranslationUnit[];
    snapshot: SessionSnapshot;
    signal: AbortSignal;
  }): Promise<TranslationEvent[]> {
    const retryCount = Math.max(0, input.snapshot.profile.runtime.retryCount);

    for (let attempt = 0; ; attempt += 1) {
      if (input.signal.aborted) return [];

      const result = await this.attemptBatch(input);
      if (input.signal.aborted) return [];
      if (!result.retryable || attempt >= retryCount) return result.events;

      const waitMs = result.retryAfterMs ?? backoffMs(attempt);
      await this.wait(waitMs, input.signal);
    }
  }

  private async attemptBatch(input: {
    request: StartTranslationRequest;
    batch: readonly TranslationUnit[];
    snapshot: SessionSnapshot;
    signal: AbortSignal;
  }): Promise<AttemptResult> {
    const { request, batch, snapshot, signal } = input;

    try {
      // 超时与用户取消任一发生都要中止请求。
      const timeoutMs = Math.max(1, snapshot.profile.runtime.timeoutMs);
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);

      const outcome = await this.deps.http.send({
        ...buildChatCompletionRequest({
          profile: snapshot.profile,
          prompt: snapshot.prompt,
          units: batch,
          ...(request.context ? { context: request.context } : {}),
        }),
        signal: combined,
      });

      if (signal.aborted) return { events: [], retryable: false };

      const content = extractCompletionContent(outcome);
      const parsed = parseTranslationResult(
        content,
        batch.map((unit) => unit.id),
      );

      const events: TranslationEvent[] = [];
      for (const unit of batch) {
        const text = parsed.translations.get(unit.id);
        if (text === undefined) {
          events.push(failed(request, unit.id, createSanitizedError('response-invalid')));
          continue;
        }
        // 只有通过单元 ID 校验的译文才写入缓存。
        await this.deps.cache.put(this.cacheDescriptorFor(snapshot, unit.text), text);
        events.push(succeeded(request, unit.id, text));
      }

      return { events, retryable: false };
    } catch (error) {
      if (signal.aborted) return { events: [], retryable: false };

      const sanitized = sanitizeError(error);
      return {
        events: batch.map((unit) => failed(request, unit.id, sanitized)),
        retryable: RETRYABLE_CODES.has(sanitized.code),
        ...(sanitized.retryAfterMs !== undefined ? { retryAfterMs: sanitized.retryAfterMs } : {}),
      };
    }
  }

  private async wait(ms: number, signal: AbortSignal): Promise<void> {
    const sleep = this.deps.sleep ?? defaultSleep;
    await sleep(ms, signal);
  }

  private cacheDescriptorFor(snapshot: SessionSnapshot, sourceText: string): TranslationCacheDescriptor {
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

  private limiterFor(profile: TranslationProfile): ConcurrencyLimiter {
    const existing = this.limiters.get(profile.id);
    if (existing && existing.limit === Math.max(1, profile.runtime.concurrency)) return existing;

    const limiter = createConcurrencyLimiter(profile.runtime.concurrency);
    this.limiters.set(profile.id, limiter);
    return limiter;
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

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function* failAll(
  request: StartTranslationRequest,
  error: SanitizedTranslationError,
): Generator<TranslationEvent> {
  for (const unit of request.units) yield failed(request, unit.id, error);
}

function succeeded(request: StartTranslationRequest, unitId: string, text: string): TranslationEvent {
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
