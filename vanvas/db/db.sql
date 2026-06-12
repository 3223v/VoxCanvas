PRAGMA foreign_keys = ON;


-- =============================================
-- 表1：canvases（不变）
-- =============================================
CREATE TABLE canvases (
  id            TEXT PRIMARY KEY,
  title         TEXT    NOT NULL DEFAULT '未命名画布',
  canvas_width  INTEGER NOT NULL DEFAULT 1200,
  canvas_height INTEGER NOT NULL DEFAULT 800,
  state         TEXT    NOT NULL DEFAULT '{"objects":[]}',
  version       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  deleted_at    TEXT
);

CREATE INDEX idx_canvases_updated ON canvases(updated_at DESC);


-- =============================================
-- 表2：commands —— 用户指令（重新设计）
-- =============================================
CREATE TABLE commands (
  id              TEXT PRIMARY KEY,
  canvas_id       TEXT    NOT NULL,
  seq             INTEGER NOT NULL,

  -- ===== 输入 =====
  input_text      TEXT    NOT NULL,

  -- ===== 意图分析工作流的原始输出（即"计划"）=====
  -- 这就是 AI 对这条指令的完整理解
  -- NULL 表示这条指令跳过了意图分析（如 UNDO、CLEAR）
  plan            TEXT,

  -- ===== AI 整体回复 =====
  ai_response     TEXT    NOT NULL DEFAULT '',

  -- ===== 状态快照 =====
  snapshot_before TEXT,

  -- ===== 执行汇总 =====
  total_tasks     INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  failed_tasks    INTEGER NOT NULL DEFAULT 0,
  is_undo         INTEGER NOT NULL DEFAULT 0,

  -- ===== 性能 =====
  -- 从意图分析到全部任务执行完成的总耗时
  latency_ms      INTEGER NOT NULL DEFAULT 0,

  created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),

  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
  UNIQUE (canvas_id, seq)
);

CREATE INDEX idx_commands_canvas_time ON commands(canvas_id, seq ASC);


-- =============================================
-- 表3：tasks —— 任务节点（微调）
-- =============================================
CREATE TABLE tasks (
  id               TEXT PRIMARY KEY,
  command_id       TEXT    NOT NULL,
  canvas_id        TEXT    NOT NULL,

  -- ===== 任务树结构 =====
  parent_task_id   TEXT,
  chain_order      INTEGER NOT NULL DEFAULT 0,
  depends_on_task_id TEXT,

  -- ===== 任务内容 =====
  task_type        TEXT    NOT NULL,
  description      TEXT    NOT NULL,
  params           TEXT    NOT NULL DEFAULT '{}',

  -- ===== 执行状态 =====
  status           TEXT    NOT NULL DEFAULT 'PENDING',

  -- ===== 执行输出 =====
  output_ops       TEXT    NOT NULL DEFAULT '[]',
  output_object_id TEXT,

  -- ===== 执行信息 =====
  used_llm         INTEGER NOT NULL DEFAULT 1,
  latency_ms       INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT,

  created_at       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  started_at       TEXT,
  completed_at     TEXT,

  FOREIGN KEY (command_id)     REFERENCES commands(id)   ON DELETE CASCADE,
  FOREIGN KEY (canvas_id)      REFERENCES canvases(id)   ON DELETE CASCADE,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_tasks_command ON tasks(command_id, chain_order ASC);
CREATE INDEX idx_tasks_status  ON tasks(status);
CREATE INDEX idx_tasks_canvas  ON tasks(canvas_id, created_at DESC);
