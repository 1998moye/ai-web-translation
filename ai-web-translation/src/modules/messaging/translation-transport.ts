import { browser } from 'wxt/browser';
import type { SessionId } from '@/shared/ids';
import type { StartTranslationRequest, TranslationEngine } from '../translation-contract/translation-engine';
import type { TranslationEvent } from '../translation-contract/types';

/** 内容脚本与后台之间的翻译事件通道；事件逐条推送，不等待整批完成。 */
export const TRANSLATION_PORT_NAME = 'aiwt:translation';

export const CANCEL_SESSION_REQUEST_TYPE = 'aiwt:cancel-session';

interface StartPortMessage {
  type: 'start';
  request: StartTranslationRequest;
}

interface EventPortMessage {
  type: 'event';
  event: TranslationEvent;
}

interface ClosedPortMessage {
  type: 'closed';
}

type PortMessage = EventPortMessage | ClosedPortMessage;

/** 只依赖用到的最小 Port 能力，便于在后台与测试中使用。 */
export interface PortLike {
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  disconnect?(): void;
}

export interface CancelSessionRequest {
  type: typeof CANCEL_SESSION_REQUEST_TYPE;
  sessionId: SessionId;
}

export function createCancelSessionRequest(sessionId: SessionId): CancelSessionRequest {
  return { type: CANCEL_SESSION_REQUEST_TYPE, sessionId };
}

export function isCancelSessionRequest(message: unknown): message is CancelSessionRequest {
  if (typeof message !== 'object' || message === null) return false;
  const record = message as Record<string, unknown>;
  return record.type === CANCEL_SESSION_REQUEST_TYPE && typeof record.sessionId === 'string';
}

function isStartPortMessage(message: unknown): message is StartPortMessage {
  if (typeof message !== 'object' || message === null) return false;
  const record = message as Record<string, unknown>;
  return record.type === 'start' && typeof record.request === 'object' && record.request !== null;
}

function isEventPortMessage(message: unknown): message is EventPortMessage {
  if (typeof message !== 'object' || message === null) return false;
  const record = message as Record<string, unknown>;
  return record.type === 'event' && typeof record.event === 'object' && record.event !== null;
}

function isClosedPortMessage(message: unknown): message is ClosedPortMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'closed';
}

class EventQueue implements AsyncIterable<TranslationEvent> {
  private readonly buffer: TranslationEvent[] = [];
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

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }
}

/**
 * 内容脚本侧的 Translation Engine Adapter：只传配置 ID 和翻译单元，
 * 请求构造与密钥都留在后台。
 */
export class MessagingTranslationEngine implements TranslationEngine {
  translate(request: StartTranslationRequest): AsyncIterable<TranslationEvent> {
    const queue = new EventQueue();
    let port: PortLike | null = null;

    try {
      port = browser.runtime.connect({ name: TRANSLATION_PORT_NAME }) as unknown as PortLike;
    } catch {
      queue.end();
      return queue;
    }

    port.onMessage.addListener((message) => {
      if (isEventPortMessage(message)) {
        queue.push(message.event);
        return;
      }
      if (isClosedPortMessage(message)) queue.end();
    });
    port.onDisconnect.addListener(() => queue.end());
    port.postMessage({ type: 'start', request } satisfies StartPortMessage);

    return withDisconnect(queue, port);
  }

  /** 取消通过独立消息发送，气泡关闭后仍然有效。 */
  async cancelSession(sessionId: SessionId): Promise<void> {
    try {
      await browser.runtime.sendMessage(createCancelSessionRequest(sessionId));
    } catch {
      // 后台不可用时没有进行中的任务需要取消。
    }
  }
}

async function* withDisconnect(queue: EventQueue, port: PortLike): AsyncGenerator<TranslationEvent> {
  try {
    yield* queue;
  } finally {
    port.disconnect?.();
  }
}

export function createMessagingTranslationEngine(): TranslationEngine {
  return new MessagingTranslationEngine();
}

/**
 * 后台侧：把一条 Port 连接接到 Translation Engine 上。
 * 连接断开时取消该连接上启动的会话，避免页面关闭后继续消耗请求。
 */
export function installTranslationPortServer(port: PortLike, engine: TranslationEngine): void {
  const sessions = new Set<SessionId>();

  port.onMessage.addListener((message) => {
    if (!isStartPortMessage(message)) return;

    const request = message.request;
    sessions.add(request.sessionId);

    void (async () => {
      try {
        for await (const event of engine.translate(request)) {
          if (!sessions.has(request.sessionId)) return;
          try {
            port.postMessage({ type: 'event', event } satisfies PortMessage);
          } catch {
            return;
          }
        }
        port.postMessage({ type: 'closed' } satisfies PortMessage);
      } catch {
        try {
          port.postMessage({ type: 'closed' } satisfies PortMessage);
        } catch {
          // 连接已关闭。
        }
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    for (const sessionId of sessions) void engine.cancelSession(sessionId);
    sessions.clear();
  });
}
