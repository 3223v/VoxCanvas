/**
 * 编排器 — 接收 TaskPlan，逐层执行 Handler，管理 canvasState 更新。
 *
 * 核心设计：同层串行执行。
 * 每个任务完成后立即更新 canvasState，下一个任务能看到前面的变更。
 */
import type { ILLMProvider } from "@/lib/llm";
import type {
  TaskNode,
  TaskPlan,
  CanvasState,
  HandlerContext,
  TaskExecutionResult,
  SSEEvent,
} from "@/lib/types";
import { cloneCanvasState, noopEmit } from "@/lib/types";
import { toposort } from "./topo-sort";
import { getHandler, initHandlers } from "@/lib/handlers/handler-registry";
import { resolveRefs } from "@/lib/handlers/utils";
import { logger } from "@/lib/logger";

// ── 输入输出 ──────────────────────────────────────────────

export interface OrchestratorInput {
  llm: ILLMProvider;
  canvasState: CanvasState;
  taskPlan: TaskPlan;
  emit?: (event: SSEEvent) => void;
}

export interface OrchestratorOutput {
  finalCanvasState: CanvasState;
  results: Map<string, TaskExecutionResult>;
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
  };
}

// ── 主函数 ─────────────────────────────────────────────────

export async function runOrchestrator(
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  const { llm, canvasState, taskPlan, emit = noopEmit } = input;

  // 确保 Handler 已注册
  initHandlers();

  const layers = toposort(taskPlan.tasks);
  const results = new Map<string, TaskExecutionResult>();
  let currentState = cloneCanvasState(canvasState);

  logger.info("orchestrator started", {
    totalTasks: taskPlan.tasks.length,
    layerCount: layers.length,
    response: taskPlan.response.slice(0, 80),
  });

  // ── 推送 PLAN_READY ──
  emit({
    type: "PLAN_READY",
    response: taskPlan.response,
    taskSummary: taskPlan.tasks.map((t) => ({
      id: t.id,
      description: t.description,
      status: "PENDING",
    })),
  });

  // ── 逐层执行 ──
  const overallStart = Date.now();

  for (const layer of layers) {
    for (const task of layer.tasks) {
      const taskStart = Date.now();

      // 解析 ref 引用
      const resolvedParams = resolveRefs(
        task.params as unknown as Record<string, unknown>,
        results
      );

      const resolvedTask: TaskNode = {
        ...task,
        params: resolvedParams as unknown as TaskNode["params"],
      };

      // 路由到 Handler
      const handler = getHandler(task.taskType);

      const ctx: HandlerContext = {
        canvasState: currentState,
        executionResults: results,
        emit,
      };

      // 推送 TASK_START
      emit({
        type: "TASK_START",
        taskId: task.id,
        description: task.description,
      });

      let result: TaskExecutionResult;

      if (!handler) {
        logger.warn("orchestrator: no handler, skipping", { taskId: task.id, taskType: task.taskType });
        result = {
          taskId: task.id,
          status: "SKIPPED",
          error: `未知 taskType: ${task.taskType}`,
        };
      } else {
        result = await handler({
          llm,
          task: resolvedTask,
          context: ctx,
        });
      }

      result.taskId = task.id;

      const taskLatency = Date.now() - taskStart;
      logger.info(
        `orchestrator: task ${task.id} → ${result.status}`,
        {
          latencyMs: taskLatency,
          error: result.error,
        }
      );

      results.set(task.id, result);

      // 更新 canvasState
      if (result.status === "SUCCESS") {
        currentState = applyResult(currentState, result);
      }

      // 推送 TASK_RESULT / TASK_FAILED
      if (result.status === "SUCCESS") {
        emit({
          type: "TASK_RESULT",
          taskId: task.id,
          description: task.description,
          canvasState: currentState,
        });
      } else {
        emit({
          type: "TASK_FAILED",
          taskId: task.id,
          description: task.description,
          error: result.error ?? "未知错误",
        });
      }
    }
  }

  const overallLatency = Date.now() - overallStart;

  // ── 计算摘要 ──
  const summary = computeSummary(results, taskPlan.tasks.length);

  // ── 推送 ALL_DONE ──
  emit({ type: "ALL_DONE", summary });

  logger.info("orchestrator completed", { ...summary, latencyMs: overallLatency });

  return { finalCanvasState: currentState, results, summary };
}

// ── canvasState 更新 ──────────────────────────────────────

function applyResult(
  state: CanvasState,
  result: TaskExecutionResult
): CanvasState {
  const objects = [...state.objects];

  if (result.status !== "SUCCESS") return state;

  if (result.outputObject) {
    // CREATE 或 CONNECT 或 MODIFY：
    // 如果同 id 已存在（MODIFY），替换；否则追加（CREATE/CONNECT）
    const existingIdx = objects.findIndex(
      (o) => o.id === result.outputObject!.id
    );
    if (existingIdx >= 0) {
      objects[existingIdx] = result.outputObject;
    } else {
      objects.push(result.outputObject);
    }
  }

  if (result.deletedObjectId) {
    const idx = objects.findIndex(
      (o) => o.id === result.deletedObjectId
    );
    if (idx >= 0) objects.splice(idx, 1);

    // 级联删除关联连线
    if (result.cascadedDeleteIds) {
      for (const cid of result.cascadedDeleteIds) {
        const ci = objects.findIndex((o) => o.id === cid);
        if (ci >= 0) objects.splice(ci, 1);
      }
    }
  }

  return { ...state, objects };
}

// ── 摘要计算 ──────────────────────────────────────────────

function computeSummary(
  results: Map<string, TaskExecutionResult>,
  total: number
): OrchestratorOutput["summary"] {
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results.values()) {
    if (r.status === "SUCCESS") success++;
    else if (r.status === "FAILED") failed++;
    else if (r.status === "SKIPPED") skipped++;
  }

  return { total, success, failed, skipped };
}
