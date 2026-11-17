import type { ButtonPosition } from './button-position-store';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ElementSize {
  width: number;
  height: number;
}

export const BUTTON_EDGE_MARGIN = 20;
/** 默认位置与边缘留出一点距离，只有拖到安全距才进入探头态。 */
export const DEFAULT_BUTTON_EDGE_MARGIN = 32;
/** 拖动过程中允许更贴近边缘，松手后弹簧回安全距离。 */
export const DRAG_EDGE_MARGIN = 6;
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
      left: viewport.width - size.width - DEFAULT_BUTTON_EDGE_MARGIN,
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
  margin: number = BUTTON_EDGE_MARGIN,
): ButtonPosition {
  return clampButtonPosition(
    { left: origin.left + delta.left, top: origin.top + delta.top },
    viewport,
    size,
    margin,
  );
}

/** 拖动与点击的区分阈值。 */
export const DRAG_THRESHOLD_PX = 4;

export function isDragGesture(movedX: number, movedY: number): boolean {
  return Math.abs(movedX) > DRAG_THRESHOLD_PX || Math.abs(movedY) > DRAG_THRESHOLD_PX;
}

export const PANEL_WIDTH_PX = 304;
const PANEL_GAP_PX = 64;
const PANEL_EDGE_MARGIN_PX = 8;

/**
 * 展开面板的显示侧：默认在按钮左侧；按钮靠左时翻到右侧，
 * 避免设置与关闭入口被推出视口。
 */
export function panelSideFor(left: number, viewportWidth: number): 'left' | 'right' {
  const fitsOnLeft = left - PANEL_GAP_PX - PANEL_WIDTH_PX >= PANEL_EDGE_MARGIN_PX;
  return fitsOnLeft ? 'left' : 'right';
}
