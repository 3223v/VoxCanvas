'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import rough from 'roughjs';
import type { DrawTool, DrawingAction } from '@/lib/types/canvas';

interface DrawingCanvasProps {
  initialActions?: DrawingAction[];
  onSave: (actions: DrawingAction[]) => void;
  isSaving?: boolean;
}

export default function DrawingCanvas({
  initialActions,
  onSave,
  isSaving,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rcRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<DrawTool>('pencil');
  const [color, setColor] = useState('#333333');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAction, setCurrentAction] = useState<DrawingAction | null>(null);
  const [actions, setActions] = useState<DrawingAction[]>(initialActions ?? []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      rcRef.current = rough.canvas(canvas);
      redraw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (initialActions && initialActions.length > 0) {
      setActions(initialActions);
    }
  }, [initialActions]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rcRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rc = rcRef.current;
    const allActions = [...actions, ...(currentAction ? [currentAction] : [])];
    allActions.forEach((a) => drawAction(rc, a));
  }, [actions, currentAction]);

  useEffect(() => { redraw(); }, [redraw]);

  const drawAction = (rc: any, action: DrawingAction) => {
    const { tool, points, color, strokeWidth } = action;
    const opts = { stroke: color, strokeWidth };

    switch (tool) {
      case 'pencil':
        for (let i = 0; i < points.length - 1; i++) {
          rc.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, opts);
        }
        break;
      case 'rectangle':
        rc.rectangle(
          points[0].x, points[0].y,
          points[points.length - 1].x - points[0].x,
          points[points.length - 1].y - points[0].y,
          { ...opts, fill: 'rgba(0,0,0,0)' }
        );
        break;
      case 'circle': {
        const cx = (points[0].x + points[points.length - 1].x) / 2;
        const cy = (points[0].y + points[points.length - 1].y) / 2;
        const r = Math.sqrt(
          Math.pow(points[points.length - 1].x - points[0].x, 2) +
          Math.pow(points[points.length - 1].y - points[0].y, 2)
        ) / 2;
        rc.circle(cx, cy, r, { ...opts, fill: 'rgba(0,0,0,0)' });
        break;
      }
      case 'line':
        rc.line(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y, opts);
        break;
    }
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    setCurrentAction({ tool, points: [getPos(e)], color, strokeWidth });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentAction) return;
    setCurrentAction((prev) =>
      prev ? { ...prev, points: [...prev.points, getPos(e)] } : prev
    );
  };

  const handleMouseUp = () => {
    if (currentAction && currentAction.points.length >= 2) {
      setActions((prev) => [...prev, currentAction]);
    }
    setIsDrawing(false);
    setCurrentAction(null);
  };

  const handleClear = () => setActions([]);
  const handleUndo = () => setActions((prev) => prev.slice(0, -1));
  const handleSave = () => onSave(actions);

  const tools: { id: DrawTool; label: string }[] = [
    { id: 'pencil', label: '铅笔' },
    { id: 'line', label: '直线' },
    { id: 'rectangle', label: '矩形' },
    { id: 'circle', label: '圆形' },
  ];

  const colors = ['#333', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6'];

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-4 px-5 py-3 bg-white/95 backdrop-blur-sm border-b border-gray-200/60 select-none">
        {/* 工具组 */}
        <div className="flex items-center bg-gray-50/80 rounded-xl p-0.5 gap-0.5">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`
                px-3.5 py-2 text-xs font-medium rounded-lg transition-all duration-150
                ${tool === t.id
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* 颜色 */}
        <div className="flex items-center gap-1.5">
          {colors.map((c) => {
            const selected = color === c;
            return (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="relative w-7 h-7 rounded-xl transition-all duration-150 hover:scale-110"
                style={{ backgroundColor: c }}
              >
                {selected && (
                  <span className="absolute inset-0 rounded-xl ring-2 ring-offset-1.5 ring-gray-800 ring-offset-white" />
                )}
              </button>
            );
          })}
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* 粗细 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 w-6">粗细</span>
          <input
            type="range"
            min="1"
            max="8"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-16 h-1 accent-gray-800 cursor-pointer"
          />
          <span className="text-[11px] text-gray-500 w-4 text-right">{strokeWidth}</span>
        </div>

        <div className="flex-1" />

        {/* 操作 */}
        <button
          onClick={handleUndo}
          disabled={actions.length === 0}
          className="px-4 py-2 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100/80 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          撤销
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100/80 rounded-xl transition-all duration-150"
        >
          清空
        </button>

        <div className="w-px h-6 bg-gray-200/60" />

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2 bg-black text-white text-xs font-medium rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-md shadow-black/20"
        >
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* 画布 */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="cursor-crosshair"
        />
      </div>
    </div>
  );
}
