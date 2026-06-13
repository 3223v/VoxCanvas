/**
 * 会话加载器 — 从 DB 加载画布状态和最近指令。
 */
import { getDb, schema } from "@/lib/db";
import { eq, isNull } from "drizzle-orm";
import commandRepo from "./command-repo";
import { logger } from "@/lib/logger";
import type { CanvasState } from "@/lib/types";
import { createEmptyCanvasState } from "@/lib/types";

const { canvases } = schema;

export interface SessionData {
  canvasState: CanvasState;
  recentCommands: string[];
}

/**
 * 加载指定画布的完整会话上下文。
 *
 * @param canvasId 画布 id
 * @returns 画布状态 + 最近 5 条指令原文
 */
export function loadSession(canvasId: string): SessionData | null {
  logger.debug("loading session", { canvasId });

  const db = getDb();

  // 加载画布记录
  const canvas = db
    .select()
    .from(canvases)
    .where(eq(canvases.id, canvasId))
    .get();

  if (!canvas) {
    logger.warn("canvas not found", { canvasId });
    return null;
  }

  // 解析画布状态
  let canvasState: CanvasState;
  try {
    const parsed = JSON.parse(canvas.state);
    canvasState = {
      objects: parsed.objects ?? [],
      meta: {
        canvasWidth: canvas.canvasWidth,
        canvasHeight: canvas.canvasHeight,
      },
    };
  } catch {
    logger.warn("failed to parse canvas state, using empty", { canvasId });
    canvasState = createEmptyCanvasState(
      canvas.canvasWidth,
      canvas.canvasHeight
    );
  }

  // 加载最近指令
  const recent = commandRepo.getRecent(canvasId, 5);
  const recentCommands = recent.map((c) => c.inputText);

  logger.debug("session loaded", {
    canvasId,
    objectCount: canvasState.objects.length,
    recentCommandsCount: recentCommands.length,
  });

  return { canvasState, recentCommands };
}
