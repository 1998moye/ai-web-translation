import type { ButtonPosition } from './button-position-store';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ElementSize {
  width: number;
  height: number;
}

export const BUTTON_EDGE_MARGIN = 12;
/** 默认位置：右侧中下部。 */
export const DEFAULT_VERTICAL_RATIO = 0.62;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** 保证按钮完整留在视口内；窗口缩小时不会永久移出可视区域。 */
export function clampButtonPosition(
  position: ButtonPosition,
  viewport: ViewportSize,
  size: ElementSize,
  margin: number = BUTTON_EDGE_MARGIN,
): ButtonPosition {
  return {
    left: clamp(position.left, margin, viewport.width - size.width - margin),
    top: clamp(position.top, margin, viewport.height - size.height - margin),
  };
}

export function defaultButtonPosition(viewport: ViewportSize, size: ElementSize): ButtonPosition {
  return clampButtonPosition(
    {
      left: viewport.width - size.width - BUTTON_EDGE_MARGIN,
      top: Math.round(viewport.height * DEFAULT_VERTICAL_RATIO),
    },
    viewport,
    size,
  );
}

export function moveButtonPosition(
  origin: ButtonPosition,
  delta: { left: number; top: number },
  viewport: ViewportSize,
  size: ElementSize,
): ButtonPosition {
  return clampButtonPosition(
    { left: origin.left + delta.left, top: origin.top + delta.top },
    viewport,
    size,
  );
}

/** 拖动与点击的区分阈值。 */
export const DRAG_THRESHOLD_PX = 4;

export function isDragGesture(movedX: number, movedY: number): boolean {
  return Math.abs(movedX) > DRAG_THRESHOLD_PX || Math.abs(movedY) > DRAG_THRESHOLD_PX;
}
