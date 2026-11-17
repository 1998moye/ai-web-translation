import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { clampButtonPosition, defaultButtonPosition, isDragGesture, moveButtonPosition, panelSideFor } from './button-position';
import type { ButtonPosition, ButtonPositionStore } from './button-position-store';

const FALLBACK_SIZE = { width: 52, height: 52 };

export interface FloatingButtonHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}

export interface FloatingButtonPositionApi {
  position: ButtonPosition;
  dragging: boolean;
  panelSide: 'left' | 'right';
  buttonRef: RefObject<HTMLDivElement | null>;
  handlers: FloatingButtonHandlers;
}

export interface UseFloatingButtonPositionOptions {
  store: ButtonPositionStore;
  onActivate: () => void;
  doc?: Document;
  win?: Window;
}

function readViewport(win: Window): { width: number; height: number } {
  return { width: win.innerWidth, height: win.innerHeight };
}

function measure(element: HTMLElement | null): { width: number; height: number } {
  if (!element || element.offsetWidth === 0 || element.offsetHeight === 0) return FALLBACK_SIZE;
  return { width: element.offsetWidth, height: element.offsetHeight };
}

/**
 * 悬浮按钮的位置与拖动：
 * - 初始使用本机保存的全局位置，没有保存时放在右侧中下部；
 * - 拖动结束才写入存储，避免拖动过程产生大量写入；
 * - 窗口缩放时重新夹取，保证按钮不会永久移出可视区域；
 * - 拖动与点击通过移动阈值区分。
 */
export function useFloatingButtonPosition({
  store,
  onActivate,
  win = window,
}: UseFloatingButtonPositionOptions): FloatingButtonPositionApi {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<ButtonPosition>({ left: 0, top: 0 });
  const [position, setPositionState] = useState<ButtonPosition>(() => defaultButtonPosition(readViewport(win), FALLBACK_SIZE));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: ButtonPosition;
    moved: boolean;
  } | null>(null);
  const justDraggedRef = useRef(false);

  const updatePosition = useCallback((next: ButtonPosition) => {
    positionRef.current = next;
    setPositionState(next);
  }, []);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    let active = true;
    const size = measure(buttonRef.current);
    const viewport = readViewport(win);

    void store.read().then((saved) => {
      if (!active) return;
      updatePosition(saved ? clampButtonPosition(saved, viewport, size) : defaultButtonPosition(viewport, size));
    });

    return () => {
      active = false;
    };
  }, [store, updatePosition, win]);

  useEffect(() => {
    const handleResize = (): void => {
      const size = measure(buttonRef.current);
      updatePosition(clampButtonPosition(positionRef.current, readViewport(win), size));
    };
    win.addEventListener('resize', handleResize);
    return () => win.removeEventListener('resize', handleResize);
  }, [updatePosition, win]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    justDraggedRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: positionRef.current,
      moved: false,
    };
    setDragging(true);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const delta = { left: event.clientX - drag.startX, top: event.clientY - drag.startY };
    if (!drag.moved && isDragGesture(delta.left, delta.top)) drag.moved = true;
    if (!drag.moved) return;

    updatePosition(moveButtonPosition(drag.origin, delta, readViewport(win), measure(buttonRef.current)));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      justDraggedRef.current = true;
      void store.write(positionRef.current);
    }
  };

  const onClick = (): void => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onActivate();
  };

  return {
    position,
    dragging,
    panelSide: panelSideFor(position.left, win.innerWidth),
    buttonRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onClick,
    },
  };
}
