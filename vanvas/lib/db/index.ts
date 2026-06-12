import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "vanvas.db");

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _sqlite = new Database(DB_PATH);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");

  // Run migration on first connect
  _sqlite.exec(`
    CREATE TABLE IF NOT EXISTS canvases (
      id            TEXT PRIMARY KEY,
      title         TEXT    NOT NULL DEFAULT '未命名画布',
      canvas_width  INTEGER NOT NULL DEFAULT 1200,
      canvas_height INTEGER NOT NULL DEFAULT 800,
      state         TEXT    NOT NULL DEFAULT '{"objects":[]}',
      version       INTEGER NOT NULL DEFAULT 0,
      thumbnail     TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      deleted_at    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_canvases_updated ON canvases(updated_at DESC);

    CREATE TABLE IF NOT EXISTS commands (
      id              TEXT PRIMARY KEY,
      canvas_id       TEXT    NOT NULL,
      seq             INTEGER NOT NULL,
      input_text      TEXT    NOT NULL,
      plan            TEXT,
      ai_response     TEXT    NOT NULL DEFAULT '',
      snapshot_before TEXT,
      total_tasks     INTEGER NOT NULL DEFAULT 0,
      completed_tasks INTEGER NOT NULL DEFAULT 0,
      failed_tasks    INTEGER NOT NULL DEFAULT 0,
      is_undo         INTEGER NOT NULL DEFAULT 0,
      latency_ms      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
      UNIQUE (canvas_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_commands_canvas_time ON commands(canvas_id, seq ASC);

    CREATE TABLE IF NOT EXISTS tasks (
      id               TEXT PRIMARY KEY,
      command_id       TEXT    NOT NULL,
      canvas_id        TEXT    NOT NULL,
      parent_task_id   TEXT,
      chain_order      INTEGER NOT NULL DEFAULT 0,
      depends_on_task_id TEXT,
      task_type        TEXT    NOT NULL,
      description      TEXT    NOT NULL,
      params           TEXT    NOT NULL DEFAULT '{}',
      status           TEXT    NOT NULL DEFAULT 'PENDING',
      output_ops       TEXT    NOT NULL DEFAULT '[]',
      output_object_id TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_tasks_command ON tasks(command_id, chain_order ASC);
    CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_canvas  ON tasks(canvas_id, created_at DESC);
  `);

  return _sqlite;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getSqlite(), { schema });
  }
  return _db;
}

export { schema };
