import {
  listCanvases,
  getCanvas,
  createCanvas,
  updateCanvas,
  deleteCanvas,
  type CanvasRow,
} from '@/lib/db/canvas-repo';

export type CanvasListItem = Omit<CanvasRow, 'state'>;
export type CanvasFull = CanvasRow;

export const canvasService = {
  list(): Promise<CanvasListItem[]> {
    return listCanvases();
  },

  async getById(id: string): Promise<CanvasFull | null> {
    return getCanvas(id);
  },

  async create(title: string, state?: string): Promise<CanvasFull> {
    const id = crypto.randomUUID();
    return createCanvas({ id, title, state });
  },

  async save(id: string, state: string, version: number): Promise<CanvasFull | null> {
    return updateCanvas(id, { state, version: version + 1 });
  },

  async rename(id: string, title: string): Promise<CanvasFull | null> {
    return updateCanvas(id, { title });
  },

  async remove(id: string): Promise<void> {
    return deleteCanvas(id);
  },
};
