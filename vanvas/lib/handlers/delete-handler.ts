/**
 * DeleteHandler — 处理 DELETE 任务。
 * 纯硬编码，不调用 LLM。自动级联删除关联连线。
 */
import type { TaskNode, HandlerContext, TaskExecutionResult, DeleteParams } from "@/lib/types";
// ILLMProvider is not used by DeleteHandler but the HandlerFn interface requires it
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ILLMProvider } from "@/lib/llm";
import { findObjectById } from "./utils";
import { logger } from "@/lib/logger";

export async function deleteHandler(input: {
  llm: ILLMProvider; // 不使用
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const { task, context } = input;
  const params = task.params as DeleteParams;

  logger.info("DeleteHandler 开始", {
    taskId: task.id,
    targetId: params.targetId,
  });

  try {
    // ── Step 1: 定位目标对象 ──
    const target = findObjectById(params.targetId, context.canvasState.objects);
    if (!target) {
      logger.warn("DeleteHandler 找不到目标", { taskId: task.id, targetId: params.targetId });
      return {
        taskId: task.id,
        status: "FAILED",
        error: `找不到目标对象: ${params.targetId}`,
      };
    }

    // ── Step 2: 查找关联连线（级联删除） ──
    const LINE_TYPES = ["arrow", "arc-arrow", "line", "dashed"];
    const cascaded = context.canvasState.objects.filter(
      (o) =>
        LINE_TYPES.includes(o.type) &&
        (o.fromId === params.targetId || o.toId === params.targetId)
    );
    const cascadedIds = cascaded.map((o) => o.id).filter(Boolean) as string[];

    logger.info("DeleteHandler 完成", {
      taskId: task.id,
      deletedObjectId: params.targetId,
      cascadedCount: cascadedIds.length,
      cascadedIds,
    });

    return {
      taskId: task.id,
      status: "SUCCESS",
      deletedObjectId: params.targetId,
      cascadedDeleteIds: cascadedIds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("DeleteHandler 失败", { taskId: task.id, error: message });
    return {
      taskId: task.id,
      status: "FAILED",
      error: message,
    };
  }
}
