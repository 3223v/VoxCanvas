'use client';

import { useEffect, useRef } from 'react';
import rough from 'roughjs';
import type { DrawingAction, CanvasDrawState } from '@/lib/types/canvas';

interface CanvasPreviewProps {
  open: boolean;
  canvas: { title: string; state: string } | null;
  onClose: () => void;
  onEdit: () => void;
}

export default function CanvasPreview({ open, canvas, onClose, onEdit }: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvas || !canvasRef.current) return;

    const cvs = canvasRef.current;
    const state: CanvasDrawState = JSON.parse(canvas.state);
    cvs.width = state.canvasWidth;
    cvs.height = state.canvasHeight;

    const rc = rough.canvas(cvs);
    const ctx = cvs.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, cvs.width, cvs.height);

    state.actions.forEach((action: DrawingAction) => {
      const { tool, points, color, strokeWidth } = action;
      const opts = { stroke: color, strokeWidth };
      if (tool === 'pencil') {
        for (let i = 0; i < points.length - 1; i++) {
          rc.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, opts);
        }
      } else if (tool === 'rectangle') {
        rc.rectangle(
          points[0].x, points[0].y,
          points[points.length - 1].x - points[0].x,
          points[points.length - 1].y - points[0].y,
          { ...opts, fill: 'rgba(0,0,0,0)' }
        );
      } else if (tool === 'circle') {
        const cx = (points[0].x + points[points.length - 1].x) / 2;
        const cy = (points[0].y + points[points.length - 1].y) / 2;
        const r = Math.sqrt(
          Math.pow(points[points.length - 1].x - points[0].x, 2) +
          Math.pow(points[points.length - 1].y - points[0].y, 2)
        ) / 2;
        rc.circle(cx, cy, r, { ...opts, fill: 'rgba(0,0,0,0)' });
      } else if (tool === 'line') {
        rc.line(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y, opts);
      }
    });
  }, [open, canvas]);

  const handleExport = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${canvas?.title ?? 'canvas'}.png`;
    a.click();
  };

  if (!open || !canvas) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-200/80 w-[720px] max-w-[94vw] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-800 truncate mr-4">{canvas.title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100/80 transition-colors flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 画布 */}
        <div className="flex-1 bg-gray-50 p-5 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[55vh] bg-white border border-gray-200 rounded-lg shadow-sm"
          />
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200/60">
          <button
            onClick={handleExport}
            className="px-5 py-2.5 text-xs font-medium text-gray-600 border border-gray-200/60 rounded-xl hover:bg-gray-50/80 hover:border-gray-300 transition-all duration-150"
          >
            导出为图片
          </button>
          <button
            onClick={() => { onEdit(); onClose(); }}
            className="px-5 py-2.5 bg-black text-white text-xs font-medium rounded-xl hover:bg-gray-800 transition-all duration-150 shadow-md shadow-black/20"
          >
            编辑
          </button>
        </div>
      </div>
    </div>
  );
}
