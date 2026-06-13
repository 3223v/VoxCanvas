/**
 * ConnectHandler — 处理 CONNECT 任务。
 */
import type { ILLMProvider } from "@/lib/llm";
import type {
  TaskNode, HandlerContext, TaskExecutionResult,
  ConnectParams, DrawObject,
} from "@/lib/types";
import { connectSubWorkflow } from "@/lib/workflow/sub-workflows";
import { findObjectById, generateObjectId, computeDefaultConnection } from "./utils";
import { logger } from "@/lib/logger";

export async function connectHandler(input: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const { llm, task, context } = input;
  const params = task.params as ConnectParams;

  logger.info("ConnectHandler 开始", {
    taskId: task.id,
    fromId: params.fromId,
    toId: params.toId,
    hasLineHint: !!params.lineHint,
  });

  try {
    // ── Step 1: 定位两端对象 ──
    const from = findObjectById(params.fromId, context.canvasState.objects);
    const to = findObjectById(params.toId, context.canvasState.objects);

    if (!from || !to) {
      const missing = !from ? params.fromId : params.toId;
      logger.warn("ConnectHandler 找不到端点", { taskId: task.id, missing });
      return {
        taskId: task.id,
        status: "FAILED",
        error: `找不到端点: ${missing}`,
      };
    }

    // ── Step 2: 判断是否需要子工作流 ──
    let connectResult: {
      lineType: DrawObject["type"];
      arrowType: "single" | "double" | "none";
      style: { stroke: string; strokeWidth: number };
      label?: string;
    };

    if (params.lineHint) {
      const subResult = await connectSubWorkflow(llm, {
        description: task.description,
        lineHint: params.lineHint,
        fromObject: {
          id: from.id, type: from.type,
          x: from.x, y: from.y, w: from.w, h: from.h,
          label: from.label,
        },
        toObject: {
          id: to.id, type: to.type,
          x: to.x, y: to.y, w: to.w, h: to.h,
          label: to.label,
        },
        canvasState: context.canvasState,
      });

      connectResult = {
        lineType: subResult.lineType,
        arrowType: subResult.arrowType,
        style: subResult.style,
        label: subResult.label,
      };
      logger.debug("ConnectHandler 子工作流完成", {
        taskId: task.id,
        lineType: connectResult.lineType,
      });
    } else {
      // 纯硬编码：默认箭头直线，中心到中心
      const def = computeDefaultConnection(from, to, params.arrowType ?? "single", params.label);
      connectResult = {
        lineType: def.lineType,
        arrowType: def.arrowType,
        style: def.style,
        label: def.label,
      };
    }

    // ── Step 3: 计算端点坐标 ──
    const fromCx = (from.x ?? 0) + (from.w ?? 0) / 2;
    const fromCy = (from.y ?? 0) + (from.h ?? 0) / 2;
    const toCx = (to.x ?? 0) + (to.w ?? 0) / 2;
    const toCy = (to.y ?? 0) + (to.h ?? 0) / 2;

    // ── Step 4: 构建连线 DrawObject ──
    const lineObj: DrawObject = {
      id: generateObjectId(),
      type: connectResult.lineType,
      points: [[fromCx, fromCy], [toCx, toCy]],
      fromId: params.fromId,
      toId: params.toId,
      stroke: connectResult.style.stroke,
      strokeWidth: connectResult.style.strokeWidth,
      roughness: 0.5,
      seed: Math.floor(Math.random() * 100),
      label: connectResult.label || params.label,
      arrowType: connectResult.arrowType,
    };

    logger.info("ConnectHandler 完成", {
      taskId: task.id,
      lineId: lineObj.id,
      lineType: lineObj.type,
    });

    return {
      taskId: task.id,
      status: "SUCCESS",
      outputObject: lineObj,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("ConnectHandler 失败", { taskId: task.id, error: message });
    return {
      taskId: task.id,
      status: "FAILED",
      error: message,
    };
  }
}
