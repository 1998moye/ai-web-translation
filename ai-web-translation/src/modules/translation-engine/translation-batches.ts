import type { TranslationUnit } from '../translation-contract/types';

export interface BatchLimits {
  /** 单个请求最多包含的翻译单元数。 */
  maxUnits: number;
  /** 单个请求最多包含的原文长度。 */
  maxCharacters: number;
}

export const DEFAULT_BATCH_LIMITS: BatchLimits = Object.freeze({ maxUnits: 8, maxCharacters: 2400 });

/**
 * 把翻译单元分组成翻译批次。
 *
 * 短文本合批以减少请求数，长文本拆开以免整页或长选区变成唯一不可拆分的请求；
 * 单个超长单元独占一批，不会被丢弃。
 */
export function groupUnitsIntoBatches(
  units: readonly TranslationUnit[],
  limits: BatchLimits = DEFAULT_BATCH_LIMITS,
): TranslationUnit[][] {
  const batches: TranslationUnit[][] = [];
  let current: TranslationUnit[] = [];
  let characters = 0;

  for (const unit of units) {
    const size = unit.text.length;
    const full = current.length >= limits.maxUnits;
    const tooLong = characters + size > limits.maxCharacters;

    if (current.length > 0 && (full || tooLong)) {
      batches.push(current);
      current = [];
      characters = 0;
    }

    current.push(unit);
    characters += size;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}
