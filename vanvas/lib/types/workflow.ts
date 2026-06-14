import { CanvasState } from "./canvas";
import { TaskNode } from "./task";

// ── task-generate 输入输出 ─────────────────────────────────

export interface TaskGenerateInput {
  canvasState: CanvasState;
  recentCommands: string[];
  currentCommand: string;
}

export interface TaskPlan {
  tasks: TaskNode[];
  response: string;
}

// ── 子工作流输入输出 ───────────────────────────────────────

export interface CreateSubWorkflowInput {
  description: string;
  shape?: string;
  label?: string;
  visualHint?: string;
  canvasState: CanvasState;
}

export interface CreateSubWorkflowOutput {
  shape: "rect" | "circle" | "ellipse" | "diamond" | "line" | "text";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    fillStyle: import("./draw-object").FillStyle;
    roughness: number;
  };
}

export interface ModifySubWorkflowInput {
  description: string;
  changeHint: string;
  targetObject: Record<string, unknown>;
  canvasState: CanvasState;
}

export interface ModifySubWorkflowOutput {
  style?: Record<string, unknown>;
  dx?: number;
  dy?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  label?: string;
}

export interface ConnectSubWorkflowInput {
  description: string;
  lineHint: string;
  fromObject: Record<string, unknown>;
  toObject: Record<string, unknown>;
  canvasState: CanvasState;
}

export interface ConnectSubWorkflowOutput {
  lineType: "arrow" | "line" | "dashed" | "arc-arrow";
  arrowType: "single" | "double" | "none";
  style: { stroke: string; strokeWidth: number };
  label?: string;
}
