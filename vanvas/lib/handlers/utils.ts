/**
 * Handler 公共工具函数。
 * 所有坐标计算和边界校验都是硬编码的，不依赖 LLM。
 */
import type { DrawObject, CanvasMeta, CanvasState } from "@/lib/types";
import { v4 as uuid } from "uuid";
import { logger } from "@/lib/logger";

// ── 对象查找 ──────────────────────────────────────────────

/**
 * 在 objects 数组中按 id 查找对象。
 */
export function findObjectById(
  id: string,
  objects: DrawObject[]
): DrawObject | undefined {
  return objects.find((o) => o.id === id);
}

/**
 * 生成唯一对象 id。
 */
export function generateObjectId(): string {
  return `obj_${uuid().slice(0, 8)}`;
}

// ── 边界约束 ──────────────────────────────────────────────

/**
 * 宽松边界约束：只确保对象至少有 20px 在画布内可见。
 * 允许对象部分溢出画布，信任 AI 的布局决策。
 * 完全不干预在画布内的坐标。
 */
export function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  // 只钳制极端情况：对象完全不可见（几乎全部在画布外）
  // 允许最多 80% 溢出，至少保留 20% 可见
  return {
    x: Math.max(-w + Math.min(w * 0.2, 20), Math.min(x, canvasWidth - Math.min(w * 0.2, 20))),
    y: Math.max(-h + Math.min(h * 0.2, 20), Math.min(y, canvasHeight - Math.min(h * 0.2, 20))),
  };
}

// ── 位置计算 ──────────────────────────────────────────────

/**
 * 为新对象找到默认位置。
 * - 画布为空 → 居中偏上
 * - 画布非空 → 放在最底部对象下方
 */
export function findDefaultPosition(
  objects: DrawObject[],
  meta: CanvasMeta,
  w: number,
  h: number
): { x: number; y: number } {
  if (objects.length === 0) {
    return {
      x: Math.round((meta.canvasWidth - w) / 2),
      y: Math.round((meta.canvasHeight - h) / 2) - 50,
    };
  }

  const bottom = objects.reduce((max, obj) =>
    ((obj.y ?? 0) + (obj.h ?? 0)) > ((max.y ?? 0) + (max.h ?? 0))
      ? obj
      : max
  );

  return {
    x: bottom.x ?? Math.round((meta.canvasWidth - w) / 2),
    y: (bottom.y ?? 0) + (bottom.h ?? 0) + 40,
  };
}

/**
 * 相对位置计算。
 * 在参照对象的上/下/左/右放置，间距 40px。
 */
export function computeRelativePosition(
  ref: DrawObject,
  direction: "right" | "below" | "left" | "above",
  w: number,
  h: number
): { x: number; y: number } {
  const rx = ref.x ?? 0;
  const ry = ref.y ?? 0;
  const rw = ref.w ?? 0;
  const rh = ref.h ?? 0;
  const gap = 40;

  switch (direction) {
    case "right":
      return { x: rx + rw + gap, y: ry };
    case "below":
      return { x: rx, y: ry + rh + gap };
    case "left":
      return { x: rx - w - gap, y: ry };
    case "above":
      return { x: rx, y: ry - h - gap };
  }
}

/**
 * 重叠检测与偏移修正。
 * 最多尝试 10 次，每次向下偏移。
 */
export function avoidOverlap(
  x: number,
  y: number,
  w: number,
  h: number,
  objects: DrawObject[],
  meta: CanvasMeta,
  spacing = 40
): { x: number; y: number } {
  let attempt = 0;
  while (attempt < 10) {
    const overlapping = objects.some((obj) => {
      const ox = obj.x ?? 0;
      const oy = obj.y ?? 0;
      const ow = obj.w ?? 0;
      const oh = obj.h ?? 0;
      return !(
        x + w < ox ||
        x > ox + ow ||
        y + h < oy ||
        y > oy + oh
      );
    });

    if (!overlapping) break;

    // 向下偏移
    y += h + spacing * (attempt + 1);
    logger.debug("avoidOverlap shifted", { attempt, newY: y });
    attempt++;
  }

  return clampPosition(x, y, w, h, meta.canvasWidth, meta.canvasHeight);
}

// ── ref 引用解析 ──────────────────────────────────────────

/**
 * 解析 params 中的 ref 引用。
 * "ref:task_N.output.id" → 替换为 executionResults 中对应任务的实际 outputObject.id。
 */
export function resolveRefs(
  params: Record<string, unknown>,
  results: Map<string, { status: string; outputObject?: DrawObject }>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.startsWith("ref:")) {
      const resolvedValue = resolveSingleRef(value, results);
      resolved[key] = resolvedValue ?? value; // 解析失败保留原值
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      resolved[key] = resolveRefs(
        value as Record<string, unknown>,
        results
      );
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

function resolveSingleRef(
  ref: string,
  results: Map<string, { status: string; outputObject?: DrawObject }>
): string | null {
  // ref 格式: "ref:task_N.output.id"
  const match = ref.match(/^ref:(task_\d+)\.output\.id$/);
  if (!match) {
    logger.warn("unrecognized ref format", { ref });
    return null;
  }

  const taskId = match[1];
  const result = results.get(taskId);
  if (!result || result.status !== "SUCCESS") {
    logger.warn("ref resolution failed: task not found or not successful", { ref, taskId });
    return null;
  }

  const objectId = result.outputObject?.id;
  if (!objectId) {
    logger.warn("ref resolution failed: task has no output object", { ref, taskId });
    return null;
  }

  logger.debug("ref resolved", { ref, objectId });
  return objectId;
}

// ── 属性变更应用 ──────────────────────────────────────────

/**
 * 将 ModifyChanges 应用到 DrawObject 上，返回更新后的对象。
 */
export function applyChanges(
  obj: DrawObject,
  changes: {
    x?: number;
    y?: number;
    dx?: number;
    dy?: number;
    w?: number;
    h?: number;
    label?: string;
    style?: Partial<{
      fill: string;
      stroke: string;
      strokeWidth: number;
      fillStyle: string;
      roughness: number;
    }>;
  }
): DrawObject {
  const updated = { ...obj };

  if (changes.x !== undefined) updated.x = changes.x;
  if (changes.y !== undefined) updated.y = changes.y;
  if (changes.dx !== undefined && updated.x !== undefined)
    updated.x += changes.dx;
  if (changes.dy !== undefined && updated.y !== undefined)
    updated.y += changes.dy;
  if (changes.w !== undefined) updated.w = changes.w;
  if (changes.h !== undefined) updated.h = changes.h;
  if (changes.label !== undefined) updated.label = changes.label;
  if (changes.style) {
    if (changes.style.fill !== undefined) updated.fill = changes.style.fill;
    if (changes.style.stroke !== undefined) updated.stroke = changes.style.stroke;
    if (changes.style.strokeWidth !== undefined) updated.strokeWidth = changes.style.strokeWidth;
    if (changes.style.fillStyle !== undefined) updated.fillStyle = changes.style.fillStyle as DrawObject["fillStyle"];
    if (changes.style.roughness !== undefined) updated.roughness = changes.style.roughness;
  }

  return updated;
}

// ── 默认连线计算 ──────────────────────────────────────────

/**
 * 计算两个对象之间的默认连线（中心到中心）。
 */
export function computeDefaultConnection(
  from: DrawObject,
  to: DrawObject,
  arrowType: "single" | "double" | "none" = "single",
  label?: string
): {
  lineType: DrawObject["type"];
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  arrowType: "single" | "double" | "none";
  style: { stroke: string; strokeWidth: number };
  label?: string;
} {
  const fromCx = (from.x ?? 0) + (from.w ?? 0) / 2;
  const fromCy = (from.y ?? 0) + (from.h ?? 0) / 2;
  const toCx = (to.x ?? 0) + (to.w ?? 0) / 2;
  const toCy = (to.y ?? 0) + (to.h ?? 0) / 2;

  return {
    lineType: "arrow",
    fromX: fromCx,
    fromY: fromCy,
    toX: toCx,
    toY: toCy,
    arrowType,
    style: { stroke: "#333333", strokeWidth: 2 },
    label,
  };
}
