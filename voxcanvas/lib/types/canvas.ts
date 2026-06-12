// types/canvas.ts

export interface CanvasObject {
  id: string;
  shape: 'rect' | 'circle' | 'ellipse' | 'diamond' | 'hexagon' | 'line';
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  style?: {
    fill?: string;
    stroke?: string;
    fillStyle?: 'hachure' | 'solid' | 'cross-hatch' | 'dots';
    roughness?: number;
    strokeWidth?: number;
  };
}

export interface CanvasState {
  objects: CanvasObject[];
  meta?: {
    canvasWidth: number;
    canvasHeight: number;
  };
}

// 绘画动作类型（用于 rough.js 画布）
export type DrawTool = 'pencil' | 'rectangle' | 'circle' | 'line';

export interface DrawingAction {
  tool: DrawTool;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

export interface CanvasDrawState {
  actions: DrawingAction[];
  canvasWidth: number;
  canvasHeight: number;
}
