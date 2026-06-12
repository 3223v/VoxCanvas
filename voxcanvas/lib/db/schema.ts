import { sqliteTable, integer, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// =============================================
// 表1：canvases
// =============================================
export const canvases = sqliteTable('canvases', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('未命名画布'),
  canvasWidth: integer('canvas_width').notNull().default(1200),
  canvasHeight: integer('canvas_height').notNull().default(800),
  state: text('state').notNull().default('{"objects":[]}'),
  version: integer('version').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now', 'localtime'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now', 'localtime'))`),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('idx_canvases_updated').on(table.updatedAt),
]);

// =============================================
// 表2：commands —— 用户指令
// =============================================
export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id').notNull().references(() => canvases.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  // ===== 输入 =====
  inputText: text('input_text').notNull(),
  // ===== 意图分析工作流的原始输出（即"计划"）=====
  plan: text('plan'),
  // ===== AI 整体回复 =====
  aiResponse: text('ai_response').notNull().default(''),
  // ===== 状态快照 =====
  snapshotBefore: text('snapshot_before'),
  // ===== 执行汇总 =====
  totalTasks: integer('total_tasks').notNull().default(0),
  completedTasks: integer('completed_tasks').notNull().default(0),
  failedTasks: integer('failed_tasks').notNull().default(0),
  isUndo: integer('is_undo').notNull().default(0),
  // ===== 性能 =====
  latencyMs: integer('latency_ms').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now', 'localtime'))`),
}, (table) => [
  uniqueIndex('idx_commands_canvas_time').on(table.canvasId, table.seq),
]);

// =============================================
// 表3：tasks —— 任务节点
// =============================================
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  commandId: text('command_id').notNull().references(() => commands.id, { onDelete: 'cascade' }),
  canvasId: text('canvas_id').notNull().references(() => canvases.id, { onDelete: 'cascade' }),
  // ===== 任务树结构 =====
  parentTaskId: text('parent_task_id'),
  chainOrder: integer('chain_order').notNull().default(0),
  dependsOnTaskId: text('depends_on_task_id'),
  // ===== 任务内容 =====
  taskType: text('task_type').notNull(),
  description: text('description').notNull(),
  params: text('params').notNull().default('{}'),
  // ===== 执行状态 =====
  status: text('status').notNull().default('PENDING'),
  // ===== 执行输出 =====
  outputOps: text('output_ops').notNull().default('[]'),
  outputObjectId: text('output_object_id'),
  // ===== 执行信息 =====
  usedLlm: integer('used_llm').notNull().default(1),
  latencyMs: integer('latency_ms').notNull().default(0),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now', 'localtime'))`),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
}, (table) => [
  index('idx_tasks_command').on(table.commandId, table.chainOrder),
  index('idx_tasks_status').on(table.status),
  index('idx_tasks_canvas').on(table.canvasId, table.createdAt),
]);
