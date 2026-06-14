import { FillStyle } from "./draw-object";

// ── TaskType ─────────────────────────────────────────────────

export type TaskType = "CREATE" | "MODIFY" | "DELETE" | "CONNECT";

export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

// ── 别名映射 ────────────────────────────────────────────────

const TASK_TYPE_ALIASES: Record<string, TaskType> = {
  create: "CREATE", add: "CREATE", draw: "CREATE",
  new: "CREATE", copy: "CREATE", duplicate: "CREATE",
  insert: "CREATE", place: "CREATE",

  modify: "MODIFY", change: "MODIFY", update: "MODIFY",
  set: "MODIFY", adjust: "MODIFY", resize: "MODIFY",
  style: "MODIFY", color: "MODIFY", move: "MODIFY",
  shift: "MODIFY", relocate: "MODIFY", nudge: "MODIFY",

  delete: "DELETE", remove: "DELETE", erase: "DELETE",

  connect: "CONNECT", link: "CONNECT", join: "CONNECT",
  arrow: "CONNECT", line: "CONNECT", wire: "CONNECT",
};

export function normalizeTaskType(raw: string): TaskType {
  const normalized = raw?.toLowerCase().trim();
  if (normalized in TASK_TYPE_ALIASES) {
    return TASK_TYPE_ALIASES[normalized];
  }
  return "CREATE"; // 兜底降级
}

// ── TaskParams（按 taskType 区分）────────────────────────────

export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillStyle: FillStyle;
  roughness: number;
}

export interface CreateParams {
  shape: "rect" | "circle" | "ellipse" | "diamond" | "text" | "line";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  label: string;
  /** line 类型的点序列 [[x1,y1],[x2,y2],...] */
  points?: number[][];
  style?: Partial<ShapeStyle>;
  /** 特殊视觉需求，由 CreateSubWorkflow 解析 */
  visualHint?: string;
  /** 允许与已有对象重叠（用于组合式构图，如立方体的面需要拼接） */
  allowOverlap?: boolean;
}

export interface ModifyChanges {
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  w?: number;
  h?: number;
  label?: string;
  style?: Partial<ShapeStyle>;
  /** 模糊修改意图（与上面具体字段互斥） */
  changeHint?: string;
}

export interface ModifyParams {
  targetId: string;
  changes: ModifyChanges;
}

export interface DeleteParams {
  targetId: string;
}

export interface ConnectParams {
  fromId: string;
  toId: string;
  label?: string;
  lineHint?: string;
  arrowType?: "single" | "double" | "none";
}

export type TaskParams =
  | CreateParams
  | ModifyParams
  | DeleteParams
  | ConnectParams;

// ── TaskNode ────────────────────────────────────────────────

export interface TaskNode {
  id: string;
  taskType: TaskType;
  description: string;
  params: TaskParams;
  dependsOn: string[];
}

// ── 默认样式 ────────────────────────────────────────────────

export const DEFAULT_STYLE: ShapeStyle = {
  fill: "#ffffff",
  stroke: "#1a1a1a",
  strokeWidth: 2,
  fillStyle: "hachure",
  roughness: 0.5,
};

export function fillDefaultStyle(style?: Partial<ShapeStyle>): ShapeStyle {
  return { ...DEFAULT_STYLE, ...style };
}
