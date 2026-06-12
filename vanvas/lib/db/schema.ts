import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const canvases = sqliteTable(
  "canvases",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default("未命名画布"),
    canvasWidth: integer("canvas_width").notNull().default(1200),
    canvasHeight: integer("canvas_height").notNull().default(800),
    state: text("state").notNull().default('{"objects":[]}'),
    version: integer("version").notNull().default(0),
    thumbnail: text("thumbnail"),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_canvases_updated").on(table.updatedAt),
  ]
);

export const commands = sqliteTable(
  "commands",
  {
    id: text("id").primaryKey(),
    canvasId: text("canvas_id").notNull().references(() => canvases.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    inputText: text("input_text").notNull(),
    plan: text("plan"),
    aiResponse: text("ai_response").notNull().default(""),
    snapshotBefore: text("snapshot_before"),
    totalTasks: integer("total_tasks").notNull().default(0),
    completedTasks: integer("completed_tasks").notNull().default(0),
    failedTasks: integer("failed_tasks").notNull().default(0),
    isUndo: integer("is_undo").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: text("created_at").notNull().default(""),
  },
  (table) => [
    uniqueIndex("idx_commands_canvas_time").on(table.canvasId, table.seq),
  ]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    commandId: text("command_id").notNull().references(() => commands.id, { onDelete: "cascade" }),
    canvasId: text("canvas_id").notNull().references(() => canvases.id, { onDelete: "cascade" }),
    parentTaskId: text("parent_task_id"),
    chainOrder: integer("chain_order").notNull().default(0),
    dependsOnTaskId: text("depends_on_task_id"),
    taskType: text("task_type").notNull(),
    description: text("description").notNull(),
    params: text("params").notNull().default("{}"),
    status: text("status").notNull().default("PENDING"),
    outputOps: text("output_ops").notNull().default("[]"),
    outputObjectId: text("output_object_id"),
    usedLlm: integer("used_llm").notNull().default(1),
    latencyMs: integer("latency_ms").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(""),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_tasks_command").on(table.commandId, table.chainOrder),
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_canvas").on(table.canvasId, table.createdAt),
  ]
);
