/**
 * 画布渲染对象类型 — 全系统共享定义。
 *
 * 前端 RoughCanvas 和后端 Handler 使用同一套类型，
 * 确保 API 返回的 objects 数组可以直接被前端消费。
 */

export type DrawObjectType =
  | "line"
  | "dashed"
  | "arrow"
  | "arc-arrow"
  | "rect"
  | "diamond"
  | "circle"
  | "ellipse"
  | "text";

export type FillStyle =
  | "solid"
  | "hachure"
  | "cross-hatch"
  | "dots"
  | "dashed"
  | "zigzag";

export interface DrawObject {
  /** 形状类型 */
  type: DrawObjectType;

  /** 自由线条的点序列（line/dashed/arrow/arc-arrow 使用） */
  points?: number[][];

  /** 几何形状的包围盒（rect/diamond/circle/ellipse 使用） */
  x?: number;
  y?: number;
  w?: number;
  h?: number;

  /** 描边颜色（十六进制 #RRGGBB） */
  stroke?: string;
  /** 描边宽度 */
  strokeWidth?: number;
  /** 手绘粗糙度 0~2，默认 0.5 */
  roughness?: number;
  /** 随机种子（控制手绘的随机偏移，同 seed 产生相同的"抖动"） */
  seed?: number;

  /** 填充颜色（十六进制） */
  fill?: string;
  /** 填充样式 */
  fillStyle?: FillStyle;

  // ── AI 绘图扩展字段 ──────────────────────────────────

  /** 对象唯一标识（AI 生成时分配，freehand 对象可无此字段） */
  id?: string;
  /** 连线起点对象 id */
  fromId?: string;
  /** 连线终点对象 id */
  toId?: string;
  /** 对象上的文字标签 */
  label?: string;
  /** 箭头类型 */
  arrowType?: "single" | "double" | "none";
  /** 文字字号（type=text 时使用，默认 16） */
  fontSize?: number;
  /** 文字对齐（type=text 时使用，默认 "left"） */
  textAlign?: "left" | "center" | "right";
}

/** 颜色预设（与 RoughCanvas 中的 COLORS 数组保持一致） */
export const STROKE_COLORS = [
  "#1a1a1a", "#e03131", "#1971c2", "#2f9e44",
  "#f08c00", "#9c36b5", "#c92a2a", "#495057",
] as const;

/** 线宽预设 */
export const STROKE_WIDTHS = [1, 2, 4, 6, 8] as const;

/** 填充样式标签映射 */
export const FILL_STYLE_LABELS: Record<FillStyle, string> = {
  solid: "实色",
  hachure: "斜线",
  "cross-hatch": "交叉",
  dots: "散点",
  dashed: "虚线",
  zigzag: "锯齿",
};
