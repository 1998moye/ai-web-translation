import { describe, expect, it } from 'vitest';
import {
  clampButtonPosition,
  defaultButtonPosition,
  isDragGesture,
  moveButtonPosition,
} from '@/modules/floating-button/button-position';
import { MemoryKeyValueStorage } from '@/modules/site-preferences/memory-storage';
import { normalizeButtonPosition, StoredButtonPosition } from '@/modules/floating-button/button-position-store';

const SIZE = { width: 52, height: 52 };

describe('悬浮按钮位置', () => {
  it('默认位于右侧中下部', () => {
    const position = defaultButtonPosition({ width: 1200, height: 800 }, SIZE);
    expect(position).toEqual({ left: 1136, top: 496 });
  });

  it('保存的位置越界时夹取回可视区域', () => {
    const position = clampButtonPosition({ left: 5000, top: -200 }, { width: 800, height: 600 }, SIZE);
    expect(position).toEqual({ left: 736, top: 12 });
  });

  it('窗口缩小时按钮不会留在视口外', () => {
    const stored = { left: 1100, top: 700 };
    const position = clampButtonPosition(stored, { width: 640, height: 480 }, SIZE);
    expect(position.left).toBeLessThanOrEqual(640 - SIZE.width - 12);
    expect(position.top).toBeLessThanOrEqual(480 - SIZE.height - 12);
  });

  it('拖动位置按增量移动且不越界', () => {
    const moved = moveButtonPosition({ left: 100, top: 100 }, { left: 40, top: 30 }, { width: 400, height: 300 }, SIZE);
    expect(moved).toEqual({ left: 140, top: 130 });

    const clamped = moveButtonPosition({ left: 100, top: 100 }, { left: -1000, top: -1000 }, { width: 400, height: 300 }, SIZE);
    expect(clamped).toEqual({ left: 12, top: 12 });
  });

  it('拖动阈值区分点击与拖动', () => {
    expect(isDragGesture(2, 2)).toBe(false);
    expect(isDragGesture(4, 4)).toBe(false);
    expect(isDragGesture(10, 0)).toBe(true);
    expect(isDragGesture(0, -9)).toBe(true);
  });
});

describe('StoredButtonPosition', () => {
  it('位置在所有网站共享保存', async () => {
    const storage = new MemoryKeyValueStorage();
    await new StoredButtonPosition(storage).write({ left: 320, top: 200 });

    const reloaded = new StoredButtonPosition(storage);
    expect(await reloaded.read()).toEqual({ left: 320, top: 200 });
  });

  it('非法位置数据被忽略', async () => {
    const storage = new MemoryKeyValueStorage();
    await storage.write('aiwt.floatingButtonPosition', { left: 'left', top: Number.NaN });

    expect(normalizeButtonPosition({ left: 1, top: 2 })).toEqual({ left: 1, top: 2 });
    expect(normalizeButtonPosition({ left: '1', top: 2 })).toBeNull();
    expect(await new StoredButtonPosition(storage).read()).toBeNull();
  });
});
