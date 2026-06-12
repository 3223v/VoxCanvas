"use client";

import { CanvasDTO } from "@/services/canvas.service";
import { useState } from "react";
import CanvasModal from "./CanvasModal";

interface DrawObject {
  type: string;
  points?: number[][];
  x?: number; y?: number; w?: number; h?: number;
  stroke?: string; strokeWidth?: number;
  fill?: string; fillStyle?: string;
}

interface CanvasCardProps {
  canvas: CanvasDTO;
  onDelete?: (id: string) => void;
}

export default function CanvasCard({ canvas, onDelete }: CanvasCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const objects = parseObjects(canvas.state);

  return (
    <>
      <div className="group relative bg-white border border-zinc-200 rounded-xl overflow-hidden
                      transition-all duration-200 hover:shadow-md hover:border-zinc-300">
        {/* Delete button (top-right) */}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center
                       rounded-md bg-white/80 text-zinc-300 hover:text-red-500 hover:bg-red-50
                       opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            title="删除"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Thumbnail area */}
        <div
          className="relative aspect-video bg-zinc-50 flex items-center justify-center
                      border-b border-zinc-100 overflow-hidden cursor-pointer"
          onClick={() => setShowModal(true)}
        >
          {canvas.thumbnail ? (
            <img src={canvas.thumbnail} alt={canvas.title} className="w-full h-full object-cover" />
          ) : objects.length > 0 ? (
            <svg
              width={canvas.canvasWidth} height={canvas.canvasHeight}
              viewBox={`0 0 ${canvas.canvasWidth} ${canvas.canvasHeight}`}
              className="w-full h-full object-contain p-1"
              preserveAspectRatio="xMidYMid meet"
            >
              {objects.map((obj, i) => (
                <RenderThumb key={i} obj={obj} />
              ))}
            </svg>
          ) : (
            <span className="text-4xl text-zinc-200 select-none">▦</span>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5
                          transition-colors flex items-center justify-center">
            <span className="text-zinc-400 text-xs opacity-0 group-hover:opacity-100
                           transition-opacity bg-white/90 px-3 py-1.5 rounded-lg
                           border border-zinc-200 shadow-sm">
              点击预览
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="text-sm font-medium text-zinc-800 truncate">{canvas.title}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">{canvas.canvasWidth} × {canvas.canvasHeight}</p>
          <p className="text-xs text-zinc-300 mt-0.5">{canvas.updatedAt}</p>
        </div>

        {/* Actions */}
        <div className="flex border-t border-zinc-100 divide-x divide-zinc-100">
          <button
            onClick={() => setShowModal(true)}
            className="flex-1 py-2.5 text-xs text-zinc-500 hover:text-zinc-800
                       hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            打开
          </button>
          <a
            href={`/paint/${canvas.id}`}
            className="flex-1 py-2.5 text-xs text-zinc-500 hover:text-zinc-800
                       hover:bg-zinc-50 transition-colors text-center cursor-pointer"
          >
            编辑
          </a>
        </div>
      </div>

      {/* Modal */}
      {showModal && <CanvasModal canvas={canvas} onClose={() => setShowModal(false)} />}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
             onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 p-6 max-w-sm w-full mx-4"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium text-zinc-800">确认删除</h3>
            <p className="text-sm text-zinc-500 mt-2">
              确定要删除「{canvas.title}」吗？此操作不可撤销。
            </p>
            <div className="flex items-center gap-3 mt-5 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200
                           text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => { onDelete?.(canvas.id); setConfirmDelete(false); }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white
                           hover:bg-red-700 transition-colors cursor-pointer"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Thumbnail helpers ──────────────────────────────────

function parseObjects(state: string): DrawObject[] {
  try {
    const parsed = JSON.parse(state);
    return parsed?.objects ?? [];
  } catch {
    return [];
  }
}

function RenderThumb({ obj }: { obj: DrawObject }) {
  const s = obj.stroke || "#1a1a1a";
  const sw = Math.max((obj.strokeWidth || 2) * 0.5, 0.5); // thinner for thumbnail
  const f = obj.fill && obj.fillStyle === "solid" ? obj.fill : "none";

  if ((obj.type === "line" || obj.type === "arrow" || obj.type === "dashed") && obj.points && obj.points.length >= 2) {
    const d = obj.points.map((p, i) => `${i===0?"M":"L"}${p[0]} ${p[1]}`).join(" ");
    return <path d={d} stroke={s} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (obj.type === "arc-arrow" && obj.points && obj.points.length === 2) {
    const [[x1,y1],[x2,y2]] = obj.points;
    const mx=(x1+x2)/2, my=(y1+y2)/2, dx=x2-x1, dy=y2-y1, dist=Math.hypot(dx,dy);
    const cpx=mx-dy/dist*dist*0.25, cpy=my+dx/dist*dist*0.25;
    return <path d={`M${x1} ${y1} Q${cpx} ${cpy} ${x2} ${y2}`} stroke={s} strokeWidth={sw} fill="none" strokeLinecap="round" />;
  }
  if (obj.type === "diamond" && obj.x !== undefined) {
    const cx=obj.x!+obj.w!/2, cy=obj.y!+obj.h!/2;
    return <polygon points={`${cx},${obj.y} ${obj.x!+obj.w!},${cy} ${cx},${obj.y!+obj.h!} ${obj.x},${cy}`}
      stroke={s} strokeWidth={sw} fill={f} />;
  }
  if (obj.type === "rect" && obj.x !== undefined) {
    return <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} stroke={s} strokeWidth={sw} fill={f} rx={1} />;
  }
  if (obj.type === "ellipse" && obj.x !== undefined) {
    return <ellipse cx={obj.x!+(obj.w||0)/2} cy={obj.y!+(obj.h||0)/2} rx={(obj.w||0)/2} ry={(obj.h||0)/2} stroke={s} strokeWidth={sw} fill={f} />;
  }
  if (obj.type === "circle" && obj.x !== undefined) {
    const size=Math.max(obj.w||0,obj.h||0);
    return <circle cx={obj.x!+size/2} cy={obj.y!+size/2} r={size/2} stroke={s} strokeWidth={sw} fill={f} />;
  }
  return null;
}
