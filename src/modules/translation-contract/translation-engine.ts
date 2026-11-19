import type { ProfileId, RequestId, SessionId } from '@/shared/ids';
import type { TranslationContext, TranslationEvent, TranslationUnit } from './types';

export interface StartTranslationRequest {
  sessionId: SessionId;
  requestId: RequestId;
  profileId: ProfileId;
  units: readonly TranslationUnit[];
  context?: TranslationContext;
}

/**
 * 配置划词翻译与整页翻译会话之间的主要 Seam。
 *
 * 调用方只能开始翻译和取消会话；请求构造、翻译提示词、分批、缓存、并发、
 * 超时、重试、取消和配置快照全部由实现隐藏。
 */
export interface TranslationEngine {
  /** 返回可逐批消费的翻译事件流；事件通过会话 ID、请求 ID 和单元 ID 对应。 */
  translate(request: StartTranslationRequest): AsyncIterable<TranslationEvent>;
  /** 终止该会话全部排队和进行中的任务。 */
  cancelSession(sessionId: SessionId): Promise<void>;
}
