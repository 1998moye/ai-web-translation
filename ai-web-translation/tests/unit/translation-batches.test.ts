import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BATCH_LIMITS,
  groupUnitsIntoBatches,
} from '@/modules/translation-engine/translation-batches';
import type { TranslationUnit } from '@/modules/translation-contract/types';

function units(count: number, text = 'A sentence to translate.'): TranslationUnit[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `unit_${index}`,
    kind: 'body' as const,
    text,
  }));
}

describe('groupUnitsIntoBatches', () => {
  it('没有单元时不产生批次', () => {
    expect(groupUnitsIntoBatches([])).toEqual([]);
  });

  it('短文本合批：不超过单元数与字符数上限', () => {
    const batches = groupUnitsIntoBatches(units(20, 'Short sentence.'));

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 4]);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(DEFAULT_BATCH_LIMITS.maxUnits);
    }
  });

  it('按字符数上限切分长文本', () => {
    const text = 'x'.repeat(1000);
    const batches = groupUnitsIntoBatches(units(6, text));

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      const characters = batch.reduce((total, unit) => total + unit.text.length, 0);
      expect(characters).toBeLessThanOrEqual(DEFAULT_BATCH_LIMITS.maxCharacters);
    }
  });

  it('单个超长单元独占一个批次，不被丢弃', () => {
    const oversized: TranslationUnit = {
      id: 'unit_big',
      kind: 'body',
      text: 'y'.repeat(DEFAULT_BATCH_LIMITS.maxCharacters + 500),
    };

    const batches = groupUnitsIntoBatches([oversized, ...units(1, 'Small one.')]);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toEqual([oversized]);
  });

  it('保持单元顺序且不重不漏', () => {
    const input = units(11);
    const batches = groupUnitsIntoBatches(input);

    expect(batches.flat().map((unit) => unit.id)).toEqual(input.map((unit) => unit.id));
  });

  it('不把整个长选区作为唯一不可拆分请求', () => {
    const input = units(40, 'A longer English paragraph that keeps going.');
    const batches = groupUnitsIntoBatches(input);

    expect(batches.length).toBeGreaterThan(1);
  });
});
