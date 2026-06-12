'use client';

import type { CanvasListItem } from '@/lib/services/canvas-service';

interface CanvasCardProps {
  canvas: CanvasListItem;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function CanvasCard({ canvas, onClick, onEdit, onDelete }: CanvasCardProps) {
  return (
    <div
      className="group relative bg-white border border-gray-200/60 rounded-2xl p-4 cursor-pointer hover:shadow-lg hover:shadow-black/5 hover:border-gray-300/80 transition-all duration-300"
      onClick={onClick}
    >
      {/* 缩略图 */}
      <div className="w-full aspect-video bg-gray-50/80 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="absolute top-1/2 left-0 w-full h-px bg-gray-100 -translate-y-1/2" />
          <div className="absolute top-0 left-1/2 w-px h-full bg-gray-100 -translate-x-1/2" />
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <circle cx="11" cy="11" r="2" />
          </svg>
        </div>
      </div>

      {/* 信息 */}
      <div className="flex items-end justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{canvas.title}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {canvas.updatedAt?.slice(0, 10)}
          </p>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100/80 transition-all duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-gray-600">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50/80 transition-all duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-red-500">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
