/**
 * Handler 注册表 — 将 taskType 路由到对应的 Handler 函数。
 */
import type { ILLMProvider } from "@/lib/llm";
import type { TaskNode, HandlerContext, TaskExecutionResult, TaskType } from "@/lib/types";
import { normalizeTaskType } from "@/lib/types";
import { createHandler } from "./create-handler";
import { modifyHandler } from "./modify-handler";
import { deleteHandler } from "./delete-handler";
import { connectHandler } from "./connect-handler";
import { logger } from "@/lib/logger";

type HandlerFn = (input: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}) => Promise<TaskExecutionResult>;

const registry = new Map<TaskType, HandlerFn>();

export function registerHandler(taskType: TaskType, handler: HandlerFn): void {
  registry.set(taskType, handler);
}

export function getHandler(taskType: string): HandlerFn | undefined {
  const normalized = normalizeTaskType(taskType);
  const handler = registry.get(normalized);
  if (!handler) {
    logger.warn("no handler registered for taskType", { taskType, normalized });
  }
  return handler;
}

/**
 * 初始化注册表（应用启动时调用一次）。
 */
let _initialized = false;

export function initHandlers(): void {
  if (_initialized) return;
  _initialized = true;

  registerHandler("CREATE", createHandler);
  registerHandler("MODIFY", modifyHandler);
  registerHandler("DELETE", deleteHandler);
  registerHandler("CONNECT", connectHandler);

  logger.info("handler registry initialized", {
    handlers: Array.from(registry.keys()),
  });
}
