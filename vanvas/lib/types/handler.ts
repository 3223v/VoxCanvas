import { CanvasState } from "./canvas";
import { DrawObject } from "./draw-object";
import { TaskStatus } from "./task";

// ── HandlerContext ─────────────────────────────────────────

export interface HandlerContext {
  /** 本任务执行前的画布状态（同层前面的任务可能已修改） */
  canvasState: CanvasState;
  /** 已完成任务的执行结果（用于解析 ref 引用） */
  executionResults: Map<string, TaskExecutionResult>;
  /** SSE 推送回调（同步模式下为 noop） */
  emit: (event: SSEEvent) => void;
}

// ── TaskExecutionResult ────────────────────────────────────

export interface TaskExecutionResult {
  taskId: string;
  status: TaskStatus;
  /** 本次任务产生的 DrawObject（CREATE/修改后的对象/CONNECT） */
  outputObject?: DrawObject;
  /** 要删除的对象 id（DELETE） */
  deletedObjectId?: string;
  /** 关联删除的连线 id 列表（DELETE 级联） */
  cascadedDeleteIds?: string[];
  /** 失败信息 */
  error?: string;
  /** LLM 消耗 */
  llmUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ── SSE 事件（简化版，与前端协议对齐）──────────────

export type SSEEvent =
  | {
      type: "PLAN_READY";
      response: string;
      taskSummary: { id: string; description: string; status: string }[];
    }
  | {
      type: "TASK_START";
      taskId: string;
      description: string;
    }
  | {
      type: "TASK_RESULT";
      taskId: string;
      description: string;
      canvasState: CanvasState;
    }
  | {
      type: "TASK_FAILED";
      taskId: string;
      description: string;
      error: string;
    }
  | {
      type: "ALL_DONE";
      summary: {
        total: number;
        success: number;
        failed: number;
        skipped: number;
      };
    };

/** 创建一个空的 emit 回调（同步模式使用） */
export function noopEmit(_event: SSEEvent): void {
  // noop
}
