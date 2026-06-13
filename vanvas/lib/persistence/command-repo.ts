/**
 * commands 表读写操作。
 */
import { getDb, schema } from "@/lib/db";
import { eq, desc, and, ne } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { now } from "@/lib/utils";
import { logger } from "@/lib/logger";

const { commands } = schema;

export interface CommandRecord {
  id: string;
  canvasId: string;
  seq: number;
  inputText: string;
  plan: string | null;
  aiResponse: string;
  snapshotBefore: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  isUndo: number;
  latencyMs: number;
  createdAt: string;
}

export interface CreateCommandInput {
  canvasId: string;
  inputText: string;
  plan?: Record<string, unknown>;
  aiResponse?: string;
  snapshotBefore?: string;
  totalTasks?: number;
  isUndo?: boolean;
}

const commandRepo = {
  /** 获取画布的下一个 seq 编号 */
  getNextSeq(canvasId: string): number {
    const db = getDb();
    const rows = db
      .select({ seq: commands.seq })
      .from(commands)
      .where(eq(commands.canvasId, canvasId))
      .orderBy(desc(commands.seq))
      .limit(1)
      .all();
    return (rows[0]?.seq ?? 0) + 1;
  },

  /** 创建一条 command 记录 */
  create(input: CreateCommandInput): CommandRecord {
    const db = getDb();
    const id = uuid();
    const seq = this.getNextSeq(input.canvasId);
    const timestamp = now();

    db.insert(commands)
      .values({
        id,
        canvasId: input.canvasId,
        seq,
        inputText: input.inputText,
        plan: input.plan ? JSON.stringify(input.plan) : null,
        aiResponse: input.aiResponse ?? "",
        snapshotBefore: input.snapshotBefore ?? null,
        totalTasks: input.totalTasks ?? 0,
        completedTasks: 0,
        failedTasks: 0,
        isUndo: input.isUndo ? 1 : 0,
        latencyMs: 0,
        createdAt: timestamp,
      })
      .run();

    logger.debug("command created", { id, canvasId: input.canvasId, seq });
    return this.getById(id)!;
  },

  /** 按 id 查询 */
  getById(id: string): CommandRecord | undefined {
    const db = getDb();
    return db.select().from(commands).where(eq(commands.id, id)).get();
  },

  /** 查询画布的最近 N 条指令（用于构建上下文） */
  getRecent(canvasId: string, limit = 5): CommandRecord[] {
    const db = getDb();
    return db
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.canvasId, canvasId),
          ne(commands.isUndo, 1)
        )
      )
      .orderBy(desc(commands.seq))
      .limit(limit)
      .all();
  },

  /** 更新执行汇总 */
  updateSummary(
    id: string,
    data: {
      completedTasks?: number;
      failedTasks?: number;
      latencyMs?: number;
      aiResponse?: string;
    }
  ): void {
    const db = getDb();
    const set: Record<string, unknown> = {};
    if (data.completedTasks !== undefined) set.completedTasks = data.completedTasks;
    if (data.failedTasks !== undefined) set.failedTasks = data.failedTasks;
    if (data.latencyMs !== undefined) set.latencyMs = data.latencyMs;
    if (data.aiResponse !== undefined) set.aiResponse = data.aiResponse;

    db.update(commands).set(set).where(eq(commands.id, id)).run();
    logger.debug("command summary updated", { id, ...data });
  },
};

export default commandRepo;
