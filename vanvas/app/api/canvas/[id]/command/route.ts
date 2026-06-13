/**
 * POST /api/canvas/[id]/command
 *
 * AI 绘图指令入口（Phase 1 — 同步模式）。
 *
 * 接收用户的自然语言指令，经过完整的 pipeline：
 *   task-generate → orchestrator → handlers → 持久化
 * 返回更新后的 objects 数组，前端直接 setObjects。
 */
import { NextRequest, NextResponse } from "next/server";
import { getLLMProvider } from "@/lib/llm";
import { taskGenerate } from "@/lib/workflow/task-generate";
import { runOrchestrator } from "@/lib/orchestrator/orchestrator";
import { loadSession } from "@/lib/persistence/session-loader";
import commandRepo from "@/lib/persistence/command-repo";
import taskRepo from "@/lib/persistence/task-repo";
import canvasService from "@/services/canvas.service";
import { now } from "@/lib/utils";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const overallStart = Date.now();
  const { id: canvasId } = await params;

  logger.info("POST /api/canvas/[id]/command", { canvasId });

  try {
    // ── 1. 解析请求 ──────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { message } = body as { message?: string };

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "缺少 message 字段" },
        { status: 400 }
      );
    }

    // ── 2. 加载会话 ──────────────────────────────────────
    const session = loadSession(canvasId);
    if (!session) {
      return NextResponse.json(
        { error: "画布不存在" },
        { status: 404 }
      );
    }

    logger.info("session loaded", {
      canvasId,
      objectCount: session.canvasState.objects.length,
      recentCommands: session.recentCommands.length,
    });

    // ── 3. 获取 LLM Provider ─────────────────────────────
    let llm;
    try {
      llm = getLLMProvider();
      logger.info("LLM provider ready", { model: llm.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("LLM provider 初始化失败", { error: msg });
      return NextResponse.json(
        {
          error: `LLM 配置错误: ${msg}`,
          hint: "请在 .env.local 中设置 LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_NAME",
        },
        { status: 500 }
      );
    }

    // ── 4. 保存 snapshot ─────────────────────────────────
    const snapshotBefore = JSON.stringify({
      objects: session.canvasState.objects,
    });

    // ── 5. task-generate（第一层 LLM）────────────────────
    let taskPlan;
    try {
      taskPlan = await taskGenerate(llm, {
        canvasState: session.canvasState,
        recentCommands: session.recentCommands,
        currentCommand: message.trim(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("task-generate 失败", { error: msg, canvasId });
      return NextResponse.json(
        { error: `AI 分析失败: ${msg}` },
        { status: 500 }
      );
    }

    logger.info("task-generate completed", {
      canvasId,
      taskCount: taskPlan.tasks.length,
      response: taskPlan.response.slice(0, 80),
    });

    // ── 6. 持久化 command ────────────────────────────────
    const command = commandRepo.create({
      canvasId,
      inputText: message.trim(),
      plan: taskPlan as unknown as Record<string, unknown>,
      aiResponse: taskPlan.response,
      snapshotBefore,
      totalTasks: taskPlan.tasks.length,
    });

    logger.info("command persisted", { commandId: command.id, seq: command.seq });

    // ── 7. 持久化 tasks（初始状态 PENDING）─────────────────
    for (const task of taskPlan.tasks) {
      taskRepo.create({
        commandId: command.id,
        canvasId,
        taskType: task.taskType,
        description: task.description,
        params: task.params as unknown as Record<string, unknown>,
        dependsOn: task.dependsOn,
        chainOrder: parseInt(task.id.replace("task_", ""), 10) || 0,
      });
    }

    // ── 8. 执行编排器 ────────────────────────────────────
    const orchestration = await runOrchestrator({
      llm,
      canvasState: session.canvasState,
      taskPlan,
    });

    // ── 9. 更新 tasks 执行结果 ────────────────────────────
    for (const task of taskPlan.tasks) {
      const result = orchestration.results.get(task.id);
      if (!result) continue;

      // 找到对应的 DB task 记录（通过 commandId + chainOrder）
      const dbTasks = taskRepo.getByCommandId(command.id);
      const dbTask = dbTasks.find(
        (t) => t.taskType === task.taskType && t.description === task.description
      );

      if (dbTask) {
        taskRepo.updateResult(dbTask.id, {
          status: result.status,
          outputObjectId: result.outputObject?.id,
          usedLlm:
            task.taskType === "CREATE" ||
            task.taskType === "MODIFY" ||
            task.taskType === "CONNECT",
          latencyMs: 0, // 单任务延迟在 orchestrator 内部记录
          errorMessage: result.error,
        });
      }
    }

    // ── 10. 更新 command 执行汇总 ─────────────────────────
    const summary = orchestration.summary;
    commandRepo.updateSummary(command.id, {
      completedTasks: summary.success,
      failedTasks: summary.failed,
      latencyMs: Date.now() - overallStart,
    });

    // ── 11. 持久化画布最终状态 ────────────────────────────
    const finalState = JSON.stringify({
      objects: orchestration.finalCanvasState.objects,
    });
    canvasService.update(canvasId, {
      state: finalState,
      version: undefined, // canvasService 内部自增
    });

    logger.info("command execution complete", {
      canvasId,
      commandId: command.id,
      ...summary,
      totalLatencyMs: Date.now() - overallStart,
    });

    // ── 12. 返回结果 ─────────────────────────────────────
    return NextResponse.json({
      response: taskPlan.response,
      objects: orchestration.finalCanvasState.objects,
      summary,
      commandId: command.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("unexpected error in command route", {
      canvasId,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: `服务器内部错误: ${msg}` },
      { status: 500 }
    );
  }
}
