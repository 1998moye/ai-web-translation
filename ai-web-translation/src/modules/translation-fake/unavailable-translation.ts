import type { SessionId } from '@/shared/ids';
import type { TranslationProfileCatalog } from '../translation-contract/profile-catalog';
import type { StartTranslationRequest, TranslationEngine } from '../translation-contract/translation-engine';
import { createSanitizedError } from '../translation-contract/sanitized-error';
import type { TranslationEvent } from '../translation-contract/types';

/**
 * 联调（ticket 19）之前的生产占位实现：不发送任何请求，也不伪造译文。
 * 内容脚本会通过公开状态提示翻译服务尚未接入。
 */
export function createUnavailableProfileCatalog(): TranslationProfileCatalog {
  return {
    async listProfiles() {
      return [];
    },
    async getDefaultProfile() {
      return null;
    },
  };
}

export function createUnavailableTranslationEngine(): TranslationEngine {
  return {
    translate(request: StartTranslationRequest): AsyncIterable<TranslationEvent> {
      return (async function* generate(): AsyncGenerator<TranslationEvent> {
        const error = createSanitizedError('profile-unavailable', '翻译服务尚未接入（等待生产联调）。');
        for (const unit of request.units) {
          yield {
            type: 'unit-failed',
            sessionId: request.sessionId,
            requestId: request.requestId,
            unitId: unit.id,
            error,
          };
        }
        yield { type: 'request-completed', sessionId: request.sessionId, requestId: request.requestId };
      })();
    },
    async cancelSession(_sessionId: SessionId): Promise<void> {
      // 占位实现没有进行中的请求。
    },
  };
}
