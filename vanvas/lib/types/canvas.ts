import { DrawObject } from "./draw-object";

/**
 * 画布状态 — 前端和后端共享的画布表示。
 */
export interface CanvasMeta {
  canvasWidth: number;
  canvasHeight: number;
}

export interface CanvasState {
  objects: DrawObject[];
  meta: CanvasMeta;
}

/**
 * 创建默认的画布状态。
 */
export function createEmptyCanvasState(
  width = 1200,
  height = 800
): CanvasState {
  return {
    objects: [],
    meta: { canvasWidth: width, canvasHeight: height },
  };
}

/**
 * 深拷贝 CanvasState（避免编排器污染原始对象）。
 */
export function cloneCanvasState(state: CanvasState): CanvasState {
  return {
    objects: state.objects.map((obj) => ({ ...obj })),
    meta: { ...state.meta },
  };
}
