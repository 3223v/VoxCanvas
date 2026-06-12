import canvasDao, { type CanvasRecord, type CreateCanvasInput, type UpdateCanvasInput } from "@/data-access/canvas.dao";
import { logger } from "@/lib/logger";

export interface CanvasDTO {
  id: string;
  title: string;
  canvasWidth: number;
  canvasHeight: number;
  state: string;
  version: number;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDTO(record: CanvasRecord): CanvasDTO {
  return {
    id: record.id,
    title: record.title,
    canvasWidth: record.canvasWidth,
    canvasHeight: record.canvasHeight,
    state: record.state,
    version: record.version,
    thumbnail: record.thumbnail,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const canvasService = {
  list(): CanvasDTO[] {
    logger.debug("Listing all canvases");
    const records = canvasDao.list();
    return records.map(toDTO);
  },

  getById(id: string): CanvasDTO | undefined {
    logger.debug("Getting canvas by id", { id });
    const record = canvasDao.getById(id);
    return record ? toDTO(record) : undefined;
  },

  create(input: CreateCanvasInput): CanvasDTO {
    logger.info("Creating canvas", { input });
    const record = canvasDao.create(input);
    return toDTO(record);
  },

  update(id: string, input: UpdateCanvasInput): CanvasDTO | undefined {
    logger.info("Updating canvas", { id, input });
    const record = canvasDao.update(id, input);
    return record ? toDTO(record) : undefined;
  },

  delete(id: string): void {
    logger.info("Soft-deleting canvas", { id });
    canvasDao.softDelete(id);
  },
};

export default canvasService;
