import { getDb, schema } from '@/lib/db';
import { canvases } from '@/lib/db/schema';
import { eq, desc, isNull } from 'drizzle-orm';

export interface CanvasRow {
  id: string;
  title: string;
  canvasWidth: number;
  canvasHeight: number;
  state: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function toRow(raw: typeof canvases.$inferSelect): CanvasRow {
  return {
    id: raw.id,
    title: raw.title,
    canvasWidth: raw.canvasWidth,
    canvasHeight: raw.canvasHeight,
    state: raw.state,
    version: raw.version,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listCanvases(): Promise<Omit<CanvasRow, 'state'>[]> {
  const db = getDb();
  const rows = db
    .select({
      id: canvases.id,
      title: canvases.title,
      canvasWidth: canvases.canvasWidth,
      canvasHeight: canvases.canvasHeight,
      version: canvases.version,
      createdAt: canvases.createdAt,
      updatedAt: canvases.updatedAt,
    })
    .from(canvases)
    .where(isNull(canvases.deletedAt))
    .orderBy(desc(canvases.updatedAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    canvasWidth: r.canvasWidth,
    canvasHeight: r.canvasHeight,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getCanvas(id: string): Promise<CanvasRow | null> {
  const db = getDb();
  const row = db.select().from(canvases).where(eq(canvases.id, id)).get();
  return row ? toRow(row) : null;
}

export async function createCanvas(input: {
  id: string;
  title: string;
  canvasWidth?: number;
  canvasHeight?: number;
  state?: string;
}): Promise<CanvasRow> {
  const db = getDb();
  const row = db
    .insert(canvases)
    .values({
      id: input.id,
      title: input.title,
      canvasWidth: input.canvasWidth ?? 1200,
      canvasHeight: input.canvasHeight ?? 800,
      state: input.state ?? '{"actions":[]}',
      version: 0,
    })
    .returning()
    .get();

  return toRow(row);
}

export async function updateCanvas(
  id: string,
  input: {
    title?: string;
    state?: string;
    version?: number;
  }
): Promise<CanvasRow | null> {
  const db = getDb();
  const setData: Record<string, unknown> = {};
  if (input.title !== undefined) setData.title = input.title;
  if (input.state !== undefined) setData.state = input.state;
  if (input.version !== undefined) setData.version = input.version;
  setData.updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const row = db
    .update(canvases)
    .set(setData as any)
    .where(eq(canvases.id, id))
    .returning()
    .get();

  return row ? toRow(row) : null;
}

export async function deleteCanvas(id: string): Promise<void> {
  const db = getDb();
  db
    .update(canvases)
    .set({
      deletedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    } as any)
    .where(eq(canvases.id, id))
    .run();
}
