/**
 * tasks 表读写操作。
 */
import { getDb, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { now } from "@/lib/utils";
import { logger } from "@/lib/logger";

const { tasks } = schema;

export interface TaskRecord {
  id: string;
  commandId: string;
  canvasId: string;
  parentTaskId: string | null;
  chainOrder: number;
  dependsOnTaskId: string | null;
  taskType: string;
  description: string;
  params: string;
  status: string;
  outputOps: string;
  outputObjectId: string | null;
  usedLlm: number;
  latencyMs: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateTaskInput {
  commandId: string;
  canvasId: string;
  taskType: string;
  description: string;
  params: Record<string, unknown>;
  dependsOn?: string[];   // JSON 数组存入 dependsOnTaskId
  parentTaskId?: string;
  chainOrder?: number;
}

const taskRepo = {
  /** 创建一条 task 记录 */
  create(input: CreateTaskInput): TaskRecord {
    const db = getDb();
    const id = uuid();
    const timestamp = now();

    db.insert(tasks)
      .values({
        id,
        commandId: input.commandId,
        canvasId: input.canvasId,
        parentTaskId: input.parentTaskId ?? null,
        chainOrder: input.chainOrder ?? 0,
        dependsOnTaskId: input.dependsOn
          ? JSON.stringify(input.dependsOn)
          : null,
        taskType: input.taskType,
        description: input.description,
        params: JSON.stringify(input.params),
        status: "PENDING",
        outputOps: "[]",
        outputObjectId: null,
        usedLlm: 0,
        latencyMs: 0,
        errorMessage: null,
        createdAt: timestamp,
        startedAt: null,
        completedAt: null,
      })
      .run();

    logger.debug("task created", { id, taskType: input.taskType, commandId: input.commandId });
    return this.getById(id)!;
  },

  /** 按 id 查询 */
  getById(id: string): TaskRecord | undefined {
    const db = getDb();
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  },

  /** 查询某个 command 下的所有 tasks */
  getByCommandId(commandId: string): TaskRecord[] {
    const db = getDb();
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.commandId, commandId))
      .orderBy(tasks.chainOrder)
      .all();
  },

  /** 更新 task 的执行结果 */
  updateResult(
    id: string,
    data: {
      status: string;
      outputOps?: Record<string, unknown>[];
      outputObjectId?: string;
      usedLlm?: boolean;
      latencyMs?: number;
      errorMessage?: string;
    }
  ): void {
    const db = getDb();
    const timestamp = now();
    const set: Record<string, unknown> = {
      status: data.status,
      completedAt: timestamp,
    };
    if (data.outputOps !== undefined) set.outputOps = JSON.stringify(data.outputOps);
    if (data.outputObjectId !== undefined) set.outputObjectId = data.outputObjectId;
    if (data.usedLlm !== undefined) set.usedLlm = data.usedLlm ? 1 : 0;
    if (data.latencyMs !== undefined) set.latencyMs = data.latencyMs;
    if (data.errorMessage !== undefined) set.errorMessage = data.errorMessage;

    db.update(tasks).set(set).where(eq(tasks.id, id)).run();
    logger.debug("task updated", { id, status: data.status });
  },

  /** 标记 task 为 RUNNING */
  markRunning(id: string): void {
    const db = getDb();
    db.update(tasks)
      .set({ status: "RUNNING", startedAt: now() })
      .where(eq(tasks.id, id))
      .run();
  },
};

export default taskRepo;
