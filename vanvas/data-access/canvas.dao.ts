import { getDb, schema } from "@/lib/db";
import { eq, desc, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { now } from "@/lib/utils";

const { canvases } = schema;

export interface CanvasRecord {
  id: string;
  title: string;
  canvasWidth: number;
  canvasHeight: number;
  state: string;
  version: number;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateCanvasInput {
  title?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  state?: string;
}

export interface UpdateCanvasInput {
  title?: string;
  state?: string;
  version?: number;
  thumbnail?: string | null;
}

const canvasDao = {
  list(): CanvasRecord[] {
    const db = getDb();
    return db
      .select()
      .from(canvases)
      .where(isNull(canvases.deletedAt))
      .orderBy(desc(canvases.updatedAt))
      .all();
  },

  getById(id: string): CanvasRecord | undefined {
    const db = getDb();
    return db.select().from(canvases).where(eq(canvases.id, id)).get();
  },

  create(input: CreateCanvasInput): CanvasRecord {
    const db = getDb();
    const id = uuid();
    const timestamp = now();
    db.insert(canvases)
      .values({
        id,
        title: input.title ?? "未命名画布",
        canvasWidth: input.canvasWidth ?? 1200,
        canvasHeight: input.canvasHeight ?? 800,
        state: input.state ?? '{"objects":[]}',
        version: 0,
        thumbnail: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      })
      .run();
    return this.getById(id)!;
  },

  update(id: string, input: UpdateCanvasInput): CanvasRecord | undefined {
    const db = getDb();
    const data: Record<string, unknown> = {
      updatedAt: now(),
    };
    if (input.title !== undefined) data.title = input.title;
    if (input.state !== undefined) data.state = input.state;
    if (input.version !== undefined) data.version = input.version;
    if (input.thumbnail !== undefined) data.thumbnail = input.thumbnail;

    db.update(canvases).set(data).where(eq(canvases.id, id)).run();
    return this.getById(id);
  },

  softDelete(id: string): void {
    const db = getDb();
    db.update(canvases)
      .set({ deletedAt: now(), updatedAt: now() })
      .where(eq(canvases.id, id))
      .run();
  },
};

export default canvasDao;
