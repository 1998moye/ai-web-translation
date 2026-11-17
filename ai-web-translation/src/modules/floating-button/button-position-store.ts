import type { KeyValueStorage } from '../site-preferences/key-value-storage';

export const BUTTON_POSITION_KEY = 'aiwt.floatingButtonPosition';

/** 悬浮翻译按钮左上角在视口中的位置（像素）。 */
export interface ButtonPosition {
  left: number;
  top: number;
}

export interface ButtonPositionStore {
  read(): Promise<ButtonPosition | null>;
  write(position: ButtonPosition): Promise<void>;
}

export function normalizeButtonPosition(value: unknown): ButtonPosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const left = record.left;
  const top = record.top;
  if (typeof left !== 'number' || typeof top !== 'number') return null;
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top };
}

/** 拖动位置在所有网站共享，因此只保存在本机扩展存储中。 */
export class StoredButtonPosition implements ButtonPositionStore {
  constructor(private readonly storage: KeyValueStorage) {}

  async read(): Promise<ButtonPosition | null> {
    return normalizeButtonPosition(await this.storage.read<unknown>(BUTTON_POSITION_KEY));
  }

  async write(position: ButtonPosition): Promise<void> {
    await this.storage.write(BUTTON_POSITION_KEY, { left: position.left, top: position.top });
  }
}
