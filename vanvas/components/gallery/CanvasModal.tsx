"use client";

import { CanvasDTO } from "@/services/canvas.service";

type FillStyle = "solid" | "hachure" | "cross-hatch" | "dots" | "dashed" | "zigzag";

interface DrawObject {
  type: "line" | "dashed" | "arrow" | "arc-arrow" | "rect" | "diamond" | "circle" | "ellipse";
  points?: number[][];
  x?: number; y?: number; w?: number; h?: number;
  stroke?: string; strokeWidth?: number; roughness?: number; seed?: number;
  fill?: string; fillStyle?: FillStyle;
}

interface CanvasModalProps { canvas: CanvasDTO; onClose: () => void; }

export default function CanvasModal({ canvas, onClose }: CanvasModalProps) {
  const stateObj = parseState(canvas.state);
  const drawObjects: DrawObject[] = stateObj?.objects ?? [];

  const handleExport = () => {
    const wrapper = document.getElementById("modal-canvas-wrapper");
    if (!wrapper) return;
    const svg = wrapper.querySelector("svg");
    if (svg) {
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const data = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([data], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${canvas.title}.svg`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-xl shadow-2xl border border-zinc-200 max-w-[90vw] max-h-[90vh] w-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div><h2 className="text-lg font-medium text-zinc-800">{canvas.title}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{canvas.canvasWidth} × {canvas.canvasHeight}</p></div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer">导出 SVG</button>
            <button onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div id="modal-canvas-wrapper" className="flex items-center justify-center p-6 bg-zinc-50/80"
          style={{ minWidth: Math.min(canvas.canvasWidth+48, 800), minHeight: Math.min(canvas.canvasHeight+48, 500) }}>
          {drawObjects.length > 0 ? (
            <svg width={canvas.canvasWidth} height={canvas.canvasHeight} viewBox={`0 0 ${canvas.canvasWidth} ${canvas.canvasHeight}`}
              className="max-w-full max-h-[60vh] bg-white shadow-sm border border-zinc-200"
              style={{ aspectRatio: `${canvas.canvasWidth}/${canvas.canvasHeight}` }}>
              <defs>
                <marker id="arrowhead-svg" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#1a1a1a" />
                </marker>
                <marker id="arrowhead-curve" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#1a1a1a" />
                </marker>
                <pattern id="p-hachure" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#888" strokeWidth="0.5"/></pattern>
                <pattern id="p-cross-hatch" patternUnits="userSpaceOnUse" width="8" height="8"><line x1="0" y1="0" x2="0" y2="8" stroke="#888" strokeWidth="0.5"/><line x1="0" y1="0" x2="8" y2="0" stroke="#888" strokeWidth="0.5"/></pattern>
                <pattern id="p-dots" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="1.5" cy="1.5" r="0.8" fill="#888"/><circle cx="4.5" cy="4.5" r="0.8" fill="#888"/></pattern>
                <pattern id="p-dashed" patternUnits="userSpaceOnUse" width="10" height="8"><line x1="0" y1="4" x2="6" y2="4" stroke="#888" strokeWidth="0.5"/></pattern>
              </defs>
              {drawObjects.map((obj, i) => <RenderObject key={i} obj={obj} />)}
            </svg>
          ) : (<div className="text-zinc-300 text-sm italic py-12">空白画布</div>)}
        </div>
      </div>
    </div>
  );
}

function parseState(state: string): { objects: DrawObject[] } | null {
  try { return JSON.parse(state); } catch { return null; }
}

function RenderObject({ obj }: { obj: DrawObject }) {
  const stroke = obj.stroke || "#1a1a1a";
  const sw = obj.strokeWidth || 2;
  const fill = obj.fill ? getFillValue(obj.fill, obj.fillStyle) : "none";

  if ((obj.type === "line" || obj.type === "arrow") && obj.points && obj.points.length >= 2) {
    const d = obj.points.map((p, i) => `${i===0?"M":"L"}${p[0]} ${p[1]}`).join(" ");
    return (
      <path d={d} stroke={stroke} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        markerEnd={obj.type==="arrow"?"url(#arrowhead-svg)":undefined} />
    );
  }
  if (obj.type === "dashed" && obj.points && obj.points.length === 2) {
    const [[x1,y1],[x2,y2]] = obj.points;
    const len = Math.hypot(x2-x1, y2-y1);
    const dash=8, gap=6, step=dash+gap, ux=(x2-x1)/len, uy=(y2-y1)/len;
    const segments: string[] = [];
    for (let i=0; i<Math.floor(len/step); i++) {
      const s0=i*step, s1=s0+dash;
      segments.push(`M${x1+ux*s0} ${y1+uy*s0}L${x1+ux*s1} ${y1+uy*s1}`);
    }
    const rem = len - Math.floor(len/step)*step;
    if (rem>1) segments.push(`M${x1+ux*Math.floor(len/step)*step} ${y1+uy*Math.floor(len/step)*step}L${x2} ${y2}`);
    return <path d={segments.join(" ")} stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round" />;
  }
  if (obj.type === "arc-arrow" && obj.points && obj.points.length === 2) {
    const [[x1,y1],[x2,y2]] = obj.points;
    const mx=(x1+x2)/2, my=(y1+y2)/2, dx=x2-x1, dy=y2-y1, dist=Math.hypot(dx,dy);
    const cpx=mx-dy/dist*dist*0.25, cpy=my+dx/dist*dist*0.25;
    const d = `M${x1} ${y1} Q${cpx} ${cpy} ${x2} ${y2}`;
    return <path d={d} stroke={stroke} strokeWidth={sw} fill="none"
      strokeLinecap="round" markerEnd="url(#arrowhead-curve)" />;
  }
  if (obj.type === "diamond" && obj.x !== undefined) {
    const cx=obj.x!+obj.w!/2, cy=obj.y!+obj.h!/2;
    return <polygon points={`${cx},${obj.y} ${obj.x!+obj.w!},${cy} ${cx},${obj.y!+obj.h!} ${obj.x},${cy}`}
      stroke={stroke} strokeWidth={sw} fill={fill} />;
  }
  if (obj.type === "rect" && obj.x !== undefined) {
    return <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} stroke={stroke} strokeWidth={sw} fill={fill} rx={1} />;
  }
  if (obj.type === "ellipse" && obj.x !== undefined) {
    return <ellipse cx={obj.x!+(obj.w||0)/2} cy={obj.y!+(obj.h||0)/2} rx={(obj.w||0)/2} ry={(obj.h||0)/2} stroke={stroke} strokeWidth={sw} fill={fill} />;
  }
  if (obj.type === "circle" && obj.x !== undefined) {
    const size=Math.max(obj.w||0,obj.h||0);
    return <circle cx={obj.x!+size/2} cy={obj.y!+size/2} r={size/2} stroke={stroke} strokeWidth={sw} fill={fill} />;
  }
  return null;
}

function getFillValue(color: string, style?: string): string {
  if (!style || style === "solid") return color;
  const map: Record<string,string> = {
    hachure: "url(#p-hachure)", "cross-hatch": "url(#p-cross-hatch)",
    dots: "url(#p-dots)", dashed: "url(#p-dashed)", zigzag: "url(#p-hachure)",
  };
  return map[style] || "none";
}
