import { createSanitizedError, sanitizeError } from '../translation-contract/sanitized-error';
import type { StartTranslationRequest, TranslationEngine } from '../translation-contract/translation-engine';
import type { SanitizedTranslationError, TranslationEvent, TranslationUnit } from '../translation-contract/types';
import { buildChatCompletionRequest } from '../translation-chat-completions/request';
import { extractCompletionContent, parseTranslationResult } from '../translation-chat-completions/response';
import type { HttpAdapter } from '../translation-chat-completions/http-adapter';
import type { TranslationProfileRepository } from '../translation-profile/profile-store';
import type { TranslationPromptRepository } from '../translation-prompt/prompt-store';
import { groupUnitsIntoBatches } from './translation-batches';

export interface ChatCompletionsEngineDeps {
  http: HttpAdapter;
  profiles: TranslationProfileRepository;
  prompts: TranslationPromptRepository;
}

/**
 * 生产 Translation Engine 实现（在后台运行）。
 *
 * 调用方只看到开始翻译与取消会话；请求构造、提示词、分批、单元 ID 校验、
 * 错误脱敏和取消都在这里隐藏，配置与密钥不会离开后台。
 */
export class ChatCompletionsTranslationEngine implements TranslationEngine {
  private readonly sessions = new Map<string, AbortController>();

  constructor(private readonly deps: ChatCompletionsEngineDeps) {}

  translate(request: StartTranslationRequest): AsyncIterable<TranslationEvent> {
    return this.run(request);
  }

  async cancelSession(sessionId: string): Promise<void> {
    const controller = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    controller?.abort();
  }

  private async *run(request: StartTranslationRequest): AsyncGenerator<TranslationEvent> {
    const controller = new AbortController();
    this.sessions.set(request.sessionId, controller);

    try {
      const profile = await this.deps.profiles.find(request.profileId);
      if (!profile) {
        yield* failAll(request, createSanitizedError('profile-unavailable'));
        yield completed(request);
        return;
      }

      // 同一会话的所有批次共用同一份配置与提示词。
      const prompt = await this.deps.prompts.read();

      for (const batch of groupUnitsIntoBatches(request.units)) {
        if (controller.signal.aborted) return;
        yield* this.translateBatch({ request, batch, profile, prompt, signal: controller.signal });
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
    profile: Parameters<typeof buildChatCompletionRequest>[0]['profile'];
    prompt: string;
    signal: AbortSignal;
  }): AsyncGenerator<TranslationEvent> {
    const { request, batch, profile, prompt, signal } = input;

    try {
      const outcome = await this.deps.http.send({
        ...buildChatCompletionRequest({
          profile,
          prompt,
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
        yield {
          type: 'unit-succeeded',
          sessionId: request.sessionId,
          requestId: request.requestId,
          unitId: unit.id,
          text,
        };
      }
    } catch (error) {
      if (signal.aborted) return;

      const sanitized = sanitizeError(error);
      for (const unit of batch) yield failed(request, unit.id, sanitized);
    }
  }
}

function* failAll(
  request: StartTranslationRequest,
  error: SanitizedTranslationError,
): Generator<TranslationEvent> {
  for (const unit of request.units) yield failed(request, unit.id, error);
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
