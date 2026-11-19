import type { SanitizedTranslationError } from '../translation-contract/types';

export type PageSessionStatus =
  | 'idle'
  | 'translating'
  | 'completed'
  | 'partial-failure'
  | 'cancelled'
  | 'restored'
  | 'failed';

export type UnitPhase = 'pending' | 'translating' | 'translated' | 'failed' | 'cancelled';

export interface PageSessionProgress {
  pending: number;
  translating: number;
  succeeded: number;
  failed: number;
  total: number;
}

export interface PageSessionState {
  status: PageSessionStatus;
  progress: PageSessionProgress;
  /** 会话级脱敏错误，例如没有可用配置。 */
  error?: SanitizedTranslationError;
  /** 最近一个失败单元的脱敏错误，用于向用户说明失败原因。 */
  lastError?: SanitizedTranslationError;
}

export function computeProgress(phases: Iterable<UnitPhase>): PageSessionProgress {
  const progress: PageSessionProgress = { pending: 0, translating: 0, succeeded: 0, failed: 0, total: 0 };

  for (const phase of phases) {
    progress.total += 1;
    if (phase === 'pending') progress.pending += 1;
    else if (phase === 'translating') progress.translating += 1;
    else if (phase === 'translated') progress.succeeded += 1;
    else if (phase === 'failed') progress.failed += 1;
  }

  return progress;
}

export function deriveActiveStatus(progress: PageSessionProgress): PageSessionStatus {
  if (progress.pending + progress.translating > 0) return 'translating';
  if (progress.failed > 0) return 'partial-failure';
  return 'completed';
}
