/**
 * ModifyHandler — 处理 MODIFY 任务。
 */
import type { ILLMProvider } from "@/lib/llm";
import type {
  TaskNode, HandlerContext, TaskExecutionResult,
  ModifyParams, DrawObject,
} from "@/lib/types";
import { modifySubWorkflow } from "@/lib/workflow/sub-workflows";
import { findObjectById, applyChanges, clampPosition } from "./utils";
import { logger } from "@/lib/logger";

export async function modifyHandler(input: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const { llm, task, context } = input;
  const params = task.params as ModifyParams;

  logger.info("ModifyHandler 开始", {
    taskId: task.id,
    targetId: params.targetId,
    hasChangeHint: !!params.changes.changeHint,
  });

  try {
    // ── Step 1: 定位目标对象 ──
    const target = findObjectById(params.targetId, context.canvasState.objects);
    if (!target) {
      logger.warn("ModifyHandler 找不到目标", { taskId: task.id, targetId: params.targetId });
      return {
        taskId: task.id,
        status: "FAILED",
        error: `找不到目标对象: ${params.targetId}`,
      };
    }

    // ── Step 2: 判断是否需要子工作流 ──
    let resolvedChanges = params.changes;

    if (params.changes.changeHint) {
      const subResult = await modifySubWorkflow(llm, {
        description: task.description,
        changeHint: params.changes.changeHint,
        targetObject: {
          type: target.type,
          x: target.x,
          y: target.y,
          w: target.w,
          h: target.h,
          label: target.label,
          stroke: target.stroke,
          strokeWidth: target.strokeWidth,
          fill: target.fill,
          fillStyle: target.fillStyle,
          roughness: target.roughness,
        },
        canvasState: context.canvasState,
      });

      // 将子工作流输出合并到 changes（去 changeHint，加具体属性）
      resolvedChanges = { ...subResult };
      logger.debug("ModifyHandler 子工作流完成", {
        taskId: task.id,
        changedFields: Object.keys(subResult),
      });
    }

    // ── Step 3: 应用变更 ──
    const updated = applyChanges(target, resolvedChanges);

    // ── Step 4: 边界校验 ──
    if (
      updated.x !== undefined &&
      updated.y !== undefined &&
      updated.w !== undefined &&
      updated.h !== undefined
    ) {
      const clamped = clampPosition(
        updated.x, updated.y, updated.w, updated.h,
        context.canvasState.meta.canvasWidth,
        context.canvasState.meta.canvasHeight
      );
      updated.x = clamped.x;
      updated.y = clamped.y;
    }

    logger.info("ModifyHandler 完成", {
      taskId: task.id,
      objectId: updated.id,
    });

    return {
      taskId: task.id,
      status: "SUCCESS",
      outputObject: updated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("ModifyHandler 失败", { taskId: task.id, error: message });
    return {
      taskId: task.id,
      status: "FAILED",
      error: message,
    };
  }
}
