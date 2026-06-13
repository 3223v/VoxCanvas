/**
 * CreateHandler — 处理 CREATE 任务。
 *
 * 流程:
 * 1. 判断是否需要子工作流（坐标/样式不完整或有 visualHint）
 * 2. 需要 → 调用 CreateSubWorkflow 补全样式
 * 3. 硬编码计算位置和边界校验
 * 4. 组装最终 DrawObject
 */
import type { ILLMProvider } from "@/lib/llm";
import type {
  TaskNode, HandlerContext, TaskExecutionResult,
  CreateParams, DrawObject,
} from "@/lib/types";
import { fillDefaultStyle } from "@/lib/types";
import { createSubWorkflow } from "@/lib/workflow/sub-workflows";
import {
  findDefaultPosition, avoidOverlap, generateObjectId,
} from "./utils";
import { logger } from "@/lib/logger";

export async function createHandler(input: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const { llm, task, context } = input;
  const params = task.params as CreateParams;
  const meta = context.canvasState.meta;

  logger.info("CreateHandler 开始", {
    taskId: task.id,
    description: task.description,
    shape: params.shape,
    hasVisualHint: !!params.visualHint,
  });

  try {
    // ── Step 1: 判断是否需要子工作流 ──
    const needsLLM =
      params.visualHint != null ||
      !params.style ||
      Object.keys(params.style).length === 0;

    let finalShape: CreateParams["shape"] = params.shape;
    let finalStyle = params.style;

    if (needsLLM) {
      const subResult = await createSubWorkflow(llm, {
        description: task.description,
        shape: params.shape,
        label: params.label,
        visualHint: params.visualHint,
        canvasState: context.canvasState,
      });

      finalShape = subResult.shape;
      finalStyle = subResult.style;
      logger.debug("CreateHandler 子工作流完成", {
        taskId: task.id,
        shape: finalShape,
        fillStyle: finalStyle.fillStyle,
      });
    }

    // ── Step 2: 合并样式 ──
    const mergedStyle = fillDefaultStyle(finalStyle);

    // ── Step 3: 确定尺寸 ──
    const w = params.w ?? 120;
    const h = params.h ?? 80;

    // ── Step 4: 确定位置 ──
    let { x, y } = params.x != null && params.y != null
      ? { x: params.x, y: params.y }
      : findDefaultPosition(
          context.canvasState.objects,
          meta,
          w,
          h
        );

    // ── Step 5: 重叠检测 ──
    const adjusted = avoidOverlap(
      x, y, w, h,
      context.canvasState.objects,
      meta
    );
    x = adjusted.x;
    y = adjusted.y;

    // ── Step 6: 组装 DrawObject ──
    const obj: DrawObject = {
      id: generateObjectId(),
      type: finalShape as DrawObject["type"],
      x,
      y,
      w,
      h,
      label: params.label || undefined,
      stroke: mergedStyle.stroke,
      strokeWidth: mergedStyle.strokeWidth,
      roughness: mergedStyle.roughness,
      seed: Math.floor(Math.random() * 100),
    };

    // 只有非白色实色填充时才设置 fill（白色背景+无填充=透明效果）
    if (mergedStyle.fill !== "#ffffff" || mergedStyle.fillStyle !== "solid") {
      obj.fill = mergedStyle.fill;
      obj.fillStyle = mergedStyle.fillStyle;
    }

    logger.info("CreateHandler 完成", {
      taskId: task.id,
      objectId: obj.id,
      type: obj.type,
      x, y, w, h,
    });

    return {
      taskId: task.id,
      status: "SUCCESS",
      outputObject: obj,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("CreateHandler 失败", { taskId: task.id, error: message });
    return {
      taskId: task.id,
      status: "FAILED",
      error: message,
    };
  }
}
