import type { StartTranslationRequest, TranslationEngine } from '@/modules/translation-contract/translation-engine';
import type { TranslationEvent } from '@/modules/translation-contract/types';

class ManualStream implements AsyncIterable<TranslationEvent> {
  private buffer: TranslationEvent[] = [];
  private waiter: (() => void) | null = null;
  private ended = false;

  push(event: TranslationEvent): void {
    if (this.ended) return;
    this.buffer.push(event);
    this.wake();
  }

  end(): void {
    this.ended = true;
    this.wake();
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

export interface ManualEngine {
  engine: TranslationEngine;
  requests: StartTranslationRequest[];
  streams: ManualStream[];
  cancelled: string[];
}

/**
 * 事件顺序完全由测试控制的 Translation Engine 替身，
 * 用于验证乱序、迟到、缺失、重复与未知单元 ID 的渲染行为。
 */
export function createManualEngine(): ManualEngine {
  const requests: StartTranslationRequest[] = [];
  const streams: ManualStream[] = [];
  const cancelled: string[] = [];

  const engine: TranslationEngine = {
    translate(request) {
      requests.push(request);
      const stream = new ManualStream();
      streams.push(stream);
      return stream;
    },
    async cancelSession(sessionId) {
      cancelled.push(sessionId);
    },
  };

  return { engine, requests, streams, cancelled };
}

export function succeed(
  manual: ManualEngine,
  requestIndex: number,
  unitIndex: number,
  text?: string,
): void {
  const request = manual.requests[requestIndex];
  const stream = manual.streams[requestIndex];
  const unit = request?.units[unitIndex];
  if (!request || !stream || !unit) throw new Error('请求或单元不存在');
  stream.push({
    type: 'unit-succeeded',
    sessionId: request.sessionId,
    requestId: request.requestId,
    unitId: unit.id,
    text: text ?? `译文：${unit.text}`,
  });
}

export function fail(manual: ManualEngine, requestIndex: number, unitIndex: number): void {
  const request = manual.requests[requestIndex];
  const stream = manual.streams[requestIndex];
  const unit = request?.units[unitIndex];
  if (!request || !stream || !unit) throw new Error('请求或单元不存在');
  stream.push({
    type: 'unit-failed',
    sessionId: request.sessionId,
    requestId: request.requestId,
    unitId: unit.id,
    error: { code: 'server', message: '模拟失败', retryable: true },
  });
}

export function emitRaw(manual: ManualEngine, requestIndex: number, event: TranslationEvent): void {
  manual.streams[requestIndex]?.push(event);
}

export function complete(manual: ManualEngine, requestIndex: number): void {
  const request = manual.requests[requestIndex];
  const stream = manual.streams[requestIndex];
  if (!request || !stream) throw new Error('请求不存在');
  stream.push({
    type: 'request-completed',
    sessionId: request.sessionId,
    requestId: request.requestId,
  });
  stream.end();
}
