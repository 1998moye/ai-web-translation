import type { SessionId } from '@/shared/ids';
import type { StartTranslationRequest, TranslationEngine } from '../translation-contract/translation-engine';
import type { SanitizedTranslationError, TranslationEvent, TranslationUnit } from '../translation-contract/types';

export interface FakeTranslationEngineOptions {
  /** 每个单元的模拟耗时；返回不同值可制造乱序返回。 */
  delayForUnit?: (unit: TranslationUnit, index: number) => number;
  /** 返回 null 表示该单元失败。 */
  translate?: (unit: TranslationUnit) => string | null;
  /** 单元失败时使用的脱敏错误。 */
  failure?: SanitizedTranslationError;
  defaultDelayMs?: number;
}

const DEFAULT_FAILURE: SanitizedTranslationError = {
  code: 'server',
  message: '模拟翻译服务暂时不可用。',
  retryable: true,
};

/** 明确标记为模拟译文，避免被误认为真实 AI 翻译。 */
export const FAKE_TRANSLATION_PREFIX = '【模拟译文】';

class EventStream implements AsyncIterable<TranslationEvent> {
  private buffer: TranslationEvent[] = [];
  private waiter: (() => void) | null = null;
  private ended = false;

  push(event: TranslationEvent): void {
    if (this.ended) return;
    this.buffer.push(event);
    this.wake();
  }

  /** 正常结束：让消费者先读完缓冲区。 */
  end(): void {
    this.ended = true;
    this.wake();
  }

  /** 取消：丢弃尚未消费的事件。 */
  close(): void {
    this.ended = true;
    this.buffer = [];
    this.wake();
  }

  get closed(): boolean {
    return this.ended;
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<TranslationEvent> {
    while (true) {
      const next = this.buffer.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}

/**
 * 测试与开发演示用的 Translation Engine Adapter。
 * 只实现 Interface 行为，不进入生产装配。
 */
export class FakeTranslationEngine implements TranslationEngine {
  readonly requests: StartTranslationRequest[] = [];
  readonly cancelledSessions = new Set<SessionId>();

  private readonly streams = new Map<SessionId, Set<EventStream>>();

  constructor(private readonly options: FakeTranslationEngineOptions = {}) {}

  translate(request: StartTranslationRequest): AsyncIterable<TranslationEvent> {
    this.requests.push(request);
    const stream = new EventStream();
    this.register(request.sessionId, stream);

    if (this.cancelledSessions.has(request.sessionId)) {
      stream.end();
      return stream;
    }

    if (request.units.length === 0) {
      stream.push({ type: 'request-completed', sessionId: request.sessionId, requestId: request.requestId });
      stream.end();
      return stream;
    }

    let remaining = request.units.length;

    request.units.forEach((unit, index) => {
      const delay = this.options.delayForUnit?.(unit, index) ?? this.options.defaultDelayMs ?? 0;
      setTimeout(() => {
        if (stream.closed || this.cancelledSessions.has(request.sessionId)) return;
        const translated = this.options.translate ? this.options.translate(unit) : `${FAKE_TRANSLATION_PREFIX}${unit.text}`;
        if (translated === null) {
          stream.push({
            type: 'unit-failed',
            sessionId: request.sessionId,
            requestId: request.requestId,
            unitId: unit.id,
            error: this.options.failure ?? DEFAULT_FAILURE,
          });
        } else {
          stream.push({
            type: 'unit-succeeded',
            sessionId: request.sessionId,
            requestId: request.requestId,
            unitId: unit.id,
            text: translated,
          });
        }
        remaining -= 1;
        if (remaining === 0) {
          stream.push({ type: 'request-completed', sessionId: request.sessionId, requestId: request.requestId });
          stream.end();
        }
      }, delay);
    });

    return stream;
  }

  async cancelSession(sessionId: SessionId): Promise<void> {
    this.cancelledSessions.add(sessionId);
    const streams = this.streams.get(sessionId);
    if (!streams) return;
    for (const stream of streams) stream.close();
    this.streams.delete(sessionId);
  }

  private register(sessionId: SessionId, stream: EventStream): void {
    let streams = this.streams.get(sessionId);
    if (!streams) {
      streams = new Set();
      this.streams.set(sessionId, streams);
    }
    streams.add(stream);
  }
}
