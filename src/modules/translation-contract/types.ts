import type { ProfileId, RequestId, SessionId, TranslationUnitId } from '@/shared/ids';

export type TranslationUnitKind = 'body' | 'interface';

/** 页面中被独立识别和处理的一段待翻译内容。 */
export interface TranslationUnit {
  id: TranslationUnitId;
  kind: TranslationUnitKind;
  /** 待翻译原文；行内代码等不可翻译内容已替换为占位标记。 */
  text: string;
}

/** 只读翻译上下文：仅用于理解当前翻译单元，自身不产生译文。 */
export interface TranslationContext {
  pageTitle?: string;
  sectionTitle?: string;
  previousText?: string;
}

export type TranslationErrorCode =
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'server'
  | 'auth'
  | 'request-invalid'
  | 'response-invalid'
  | 'cancelled'
  | 'profile-unavailable'
  | 'unknown';

/** 脱敏错误：可以直接展示给用户，不包含 API Key、敏感请求头或完整请求体。 */
export interface SanitizedTranslationError {
  code: TranslationErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export type TranslationEvent =
  | {
      type: 'unit-succeeded';
      sessionId: SessionId;
      requestId: RequestId;
      unitId: TranslationUnitId;
      text: string;
    }
  | {
      type: 'unit-failed';
      sessionId: SessionId;
      requestId: RequestId;
      unitId: TranslationUnitId;
      error: SanitizedTranslationError;
    }
  | {
      type: 'request-completed';
      sessionId: SessionId;
      requestId: RequestId;
    };
