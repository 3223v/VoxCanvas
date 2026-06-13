"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import rough from "roughjs";
import Toolbar from "./Toolbar";
import AspectRatioPicker from "./AspectRatioPicker";

import type { DrawObject, FillStyle } from "@/lib/types";

type Tool = "pen" | "line" | "dashed" | "arrow" | "arc-arrow" | "rect" | "diamond" | "circle" | "ellipse" | "text";

const COLORS = ["#1a1a1a","#e03131","#1971c2","#2f9e44","#f08c00","#9c36b5","#c92a2a","#495057"];
const WIDTHS = [1,2,4,6,8];
const FILL_STYLES: { key: FillStyle | ""; label: string }[] = [
  { key: "", label: "无" }, { key: "solid", label: "实色" },
  { key: "hachure", label: "斜线" }, { key: "cross-hatch", label: "交叉" },
  { key: "dots", label: "散点" }, { key: "dashed", label: "虚线" },
];

interface RoughCanvasProps {
  width: number; height: number;
  objects: DrawObject[];
  onObjectsChange: (objects: DrawObject[]) => void;
  onCanvasSizeChange: (width: number, height: number) => void;
  title: string;
  canvasId: string;
  onSaveClick: () => void;
  saving: boolean;
}

function clampZoom(z: number) { return Math.min(5, Math.max(0.1, z)); }

/** 检测点击是否落在文字对象的包围盒内 */
function hitTestText(obj: DrawObject, px: number, py: number): boolean {
  if (obj.type !== "text" || !obj.label) return false;
  const fontSize = obj.fontSize ?? 16;
  const lines = obj.label.split("\n");
  // 字符宽度粗略估算：中文字符 ~= fontSize，英文 ~= fontSize * 0.6
  const maxLineWidth = Math.max(...lines.map((l) => {
    let w = 0;
    for (const ch of l) {
      w += /[一-鿿]/.test(ch) ? fontSize : fontSize * 0.6;
    }
    return w;
  }));
  const tw = Math.max(maxLineWidth, 40);
  const th = lines.length * fontSize * 1.4;
  return (
    px >= (obj.x ?? 0) && px <= (obj.x ?? 0) + tw &&
    py >= (obj.y ?? 0) && py <= (obj.y ?? 0) + th
  );
}

export default function RoughCanvas({
  width, height, objects, onObjectsChange, onCanvasSizeChange,
  title, canvasId, onSaveClick, saving,
}: RoughCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const drawingRef = useRef(false);
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [zoom, setZoom] = useState(1);
  const [strokeColor, setStrokeColor] = useState("#1a1a1a");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState("#e03131");
  const [fillStyle, setFillStyle] = useState<FillStyle | "">("");
  const currentStrokeRef = useRef<number[][]>([]);
  const startPointRef = useRef<[number, number]>([0, 0]);

  // ── Selection + drag state ─────────────────────────────
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const lastClickTimeRef = useRef(0);
  const lastClickTargetRef = useRef<string | null>(null);

  // ── Inline edit state ──────────────────────────────────
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  // 编辑框的屏幕坐标（相对于 viewport）
  const [editScreenPos, setEditScreenPos] = useState<{ left: number; top: number } | null>(null);

  const buildOpts = useCallback(() => ({
    stroke: strokeColor, strokeWidth,
    roughness: 0.5, seed: Math.floor(Math.random() * 100),
    ...(fillStyle ? { fill: fillColor, fillStyle } : {}),
  }), [strokeColor, strokeWidth, fillColor, fillStyle]);

  // ── Deselect when switching away from text tool ────────
  const handleToolChange = useCallback((tool: Tool) => {
    setActiveTool(tool);
    if (tool !== "text") {
      setSelectedObjectId(null);
      setEditingTextId(null);
      setEditScreenPos(null);
    }
  }, []);

  // ── Redraw ────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const rc = rough.canvas(canvas);

    for (const obj of objects) {
      const s = obj.stroke || "#1a1a1a";
      const sw = obj.strokeWidth || 2;
      const opts: Record<string, unknown> = { stroke: s, strokeWidth: sw, roughness: obj.roughness ?? 0.5, seed: obj.seed ?? 42 };
      if (obj.fill) { opts.fill = obj.fill; opts.fillStyle = obj.fillStyle || "hachure"; }

      const drawArrow = (p0: number[], p1: number[]) => {
        rc.line(p0[0], p0[1], p1[0], p1[1], opts);
        const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        const hl = Math.max(10, sw * 6), ha = Math.PI / 7;
        rc.line(p1[0], p1[1], p1[0] - hl * Math.cos(angle - ha), p1[1] - hl * Math.sin(angle - ha), opts);
        rc.line(p1[0], p1[1], p1[0] - hl * Math.cos(angle + ha), p1[1] - hl * Math.sin(angle + ha), opts);
      };

      if (obj.type === "line" && obj.points && obj.points.length >= 2) {
        for (let i = 1; i < obj.points.length; i++)
          rc.line(obj.points[i-1][0], obj.points[i-1][1], obj.points[i][0], obj.points[i][1], opts);
      } else if (obj.type === "dashed" && obj.points && obj.points.length === 2) {
        const [p0, p1] = obj.points;
        const len = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]);
        const dash = 8, gap = 6, step = dash + gap;
        const segments = Math.floor(len / step);
        const ux = (p1[0]-p0[0]) / len, uy = (p1[1]-p0[1]) / len;
        for (let i = 0; i < segments; i++) {
          const s0 = i * step, s1 = s0 + dash;
          rc.line(p0[0]+ux*s0, p0[1]+uy*s0, p0[0]+ux*s1, p0[1]+uy*s1, opts);
        }
        const remainder = len - segments * step;
        if (remainder > 1)
          rc.line(p0[0]+ux*segments*step, p0[1]+uy*segments*step, p1[0], p1[1], opts);
      } else if (obj.type === "arrow" && obj.points && obj.points.length === 2) {
        drawArrow(obj.points[0], obj.points[1]);
      } else if (obj.type === "arc-arrow" && obj.points && obj.points.length === 2) {
        const [p0, p1] = obj.points;
        const mx = (p0[0]+p1[0])/2, my = (p0[1]+p1[1])/2;
        const dx = p1[0]-p0[0], dy = p1[1]-p0[1];
        const dist = Math.hypot(dx, dy);
        const offset = dist * 0.25;
        const cpx = mx - dy / dist * offset;
        const cpy = my + dx / dist * offset;
        const curvePts: [number,number][] = [];
        const steps = 20;
        for (let t = 0; t <= steps; t++) {
          const tt = t / steps;
          const x = (1-tt)*(1-tt)*p0[0] + 2*(1-tt)*tt*cpx + tt*tt*p1[0];
          const y = (1-tt)*(1-tt)*p0[1] + 2*(1-tt)*tt*cpy + tt*tt*p1[1];
          curvePts.push([x, y]);
        }
        for (let i = 1; i < curvePts.length; i++)
          rc.line(curvePts[i-1][0], curvePts[i-1][1], curvePts[i][0], curvePts[i][1], opts);
        const prev = curvePts[curvePts.length - 2];
        const angle = Math.atan2(p1[1]-prev[1], p1[0]-prev[0]);
        const hl = Math.max(10, sw * 6), ha = Math.PI / 7;
        rc.line(p1[0], p1[1], p1[0]-hl*Math.cos(angle-ha), p1[1]-hl*Math.sin(angle-ha), opts);
        rc.line(p1[0], p1[1], p1[0]-hl*Math.cos(angle+ha), p1[1]-hl*Math.sin(angle+ha), opts);
      } else if (obj.type === "rect" && obj.x !== undefined) {
        rc.rectangle(obj.x!, obj.y!, obj.w!, obj.h!, opts);
      } else if (obj.type === "diamond" && obj.x !== undefined) {
        const cx = obj.x! + obj.w!/2, cy = obj.y! + obj.h!/2;
        rc.polygon([
          [cx, obj.y!], [obj.x!+obj.w!, cy],
          [cx, obj.y!+obj.h!], [obj.x!, cy],
        ], opts);
      } else if (obj.type === "ellipse" && obj.x !== undefined) {
        rc.ellipse(obj.x!+obj.w!/2, obj.y!+obj.h!/2, obj.w!, obj.h!, opts);
      } else if (obj.type === "circle" && obj.x !== undefined) {
        const size = Math.max(obj.w || 0, obj.h || 0);
        rc.circle(obj.x!+size/2, obj.y!+size/2, size, opts);
      }

      // ── Text rendering (Canvas native) ──
      if (obj.type === "text" && obj.label) {
        const fontSize = obj.fontSize ?? 16;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = obj.stroke ?? "#1a1a1a";
        ctx.textAlign = (obj.textAlign as CanvasTextAlign) ?? "left";
        ctx.textBaseline = "top";
        const tx = obj.x ?? 0;
        const ty = obj.y ?? 0;
        const lines = obj.label.split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, tx, ty + i * (fontSize * 1.4));
        });
      }

      // ── Selection indicator (dashed border around selected text) ──
      if (obj.type === "text" && obj.id === selectedObjectId && obj.label) {
        const fontSize = obj.fontSize ?? 16;
        const lines = obj.label.split("\n");
        let maxW = 0;
        for (const l of lines) {
          let w = 0;
          for (const ch of l) {
            w += /[一-鿿]/.test(ch) ? fontSize : fontSize * 0.6;
          }
          if (w > maxW) maxW = w;
        }
        const tw = Math.max(maxW, 40);
        const th = lines.length * fontSize * 1.4;
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect((obj.x ?? 0) - 2, (obj.y ?? 0) - 2, tw + 4, th + 4);
        ctx.setLineDash([]);
      }
    }
  }, [objects, width, height, selectedObjectId]);

  useEffect(() => { redraw(); }, [redraw]);

  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const pw = vp.clientWidth - 32, ph = vp.clientHeight - 32;
    if (pw<=0||ph<=0) return;
    setZoom(Math.round(Math.min(pw/width, ph/height, 1)*100)/100);
  }, [width, height]);

  // ── Coordinate helpers ────────────────────────────────

  const getPos = (e: React.MouseEvent | React.TouchEvent): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const sx = width / r.width, sy = height / r.height;
    let cx: number, cy: number;
    if ("touches" in e) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    return [(cx - r.left) * sx, (cy - r.top) * sy];
  };

  /** 计算 canvas 坐标对应的屏幕像素坐标（相对于 viewport） */
  const canvasToScreen = useCallback((cx: number, cy: number): { left: number; top: number } => {
    const c = canvasRef.current;
    const vp = viewportRef.current;
    if (!c || !vp) return { left: cx, top: cy };
    const r = c.getBoundingClientRect();
    const vpr = vp.getBoundingClientRect();
    return {
      left: r.left - vpr.left + (cx / width) * r.width + vp.scrollLeft,
      top: r.top - vpr.top + (cy / height) * r.height + vp.scrollTop,
    };
  }, [width, height]);

  const drawShapePreview = (tool: Tool, pos: [number, number]) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    redraw();
    const [x1, y1] = startPointRef.current, [x2, y2] = pos;
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    ctx.strokeStyle = strokeColor; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.5;
    if (tool==="rect") ctx.strokeRect(x, y, w, h);
    else if (tool==="diamond") {
      const cx = x+w/2, cy = y+h/2;
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x+w, cy);
      ctx.lineTo(cx, y+h); ctx.lineTo(x, cy); ctx.closePath(); ctx.stroke();
    } else if (tool==="ellipse") { ctx.beginPath(); ctx.ellipse(x+w/2, y+h/2, w/2, h/2, 0, 0, Math.PI*2); ctx.stroke(); }
    else if (tool==="circle") { ctx.beginPath(); ctx.arc(x1, y1, Math.hypot(x2-x1,y2-y1), 0, Math.PI*2); ctx.stroke(); }
    else if (tool==="line"||tool==="arrow"||tool==="dashed") { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
    else if (tool==="arc-arrow") {
      const mx=(x1+x2)/2, my=(y1+y2)/2, dist=Math.hypot(x2-x1,y2-y1);
      const offset=dist*0.25, cpx=mx-(y2-y1)/dist*offset, cpy=my+(x2-x1)/dist*offset;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo(cpx,cpy,x2,y2); ctx.stroke();
      const t = 0.95;
      const bx=(1-t)*(1-t)*x1+2*(1-t)*t*cpx+t*t*x2, by=(1-t)*(1-t)*y1+2*(1-t)*t*cpy+t*t*y2;
      const ang=Math.atan2(y2-by,x2-bx);
      ctx.beginPath(); ctx.moveTo(x2,y2);
      ctx.lineTo(x2-8*Math.cos(ang-Math.PI/7), y2-8*Math.sin(ang-Math.PI/7));
      ctx.lineTo(x2-8*Math.cos(ang+Math.PI/7), y2-8*Math.sin(ang+Math.PI/7));
      ctx.closePath(); ctx.fillStyle=strokeColor; ctx.fill();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  };

  // ── Pointer events ────────────────────────────────────

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);

    // ── Text tool ────────────────────────────────────────
    if (activeTool === "text") {
      const clickedText = objects.find((obj) => hitTestText(obj, pos[0], pos[1]));

      if (clickedText) {
        const now = Date.now();
        const isDoubleClick =
          now - lastClickTimeRef.current < 350 &&
          lastClickTargetRef.current === clickedText.id;

        lastClickTimeRef.current = now;
        lastClickTargetRef.current = clickedText.id ?? null;

        if (isDoubleClick) {
          // 双击 → 原地编辑
          setSelectedObjectId(clickedText.id ?? null);
          setEditingTextId(clickedText.id ?? null);
          setEditingTextValue(clickedText.label ?? "");
          const screenPos = canvasToScreen(clickedText.x ?? pos[0], clickedText.y ?? pos[1]);
          setEditScreenPos(screenPos);
        } else {
          // 单击 → 选中，准备拖动
          setSelectedObjectId(clickedText.id ?? null);
          setEditingTextId(null);
          setEditScreenPos(null);
          isDraggingRef.current = true;
          dragOffsetRef.current = {
            dx: pos[0] - (clickedText.x ?? 0),
            dy: pos[1] - (clickedText.y ?? 0),
          };
        }
        return;
      }

      // 点击空白 → 取消选中，创建新文字
      setSelectedObjectId(null);
      setEditingTextId(null);
      setEditScreenPos(null);
      const newId = `text_${Date.now()}`;
      const newObj: DrawObject = {
        id: newId, type: "text", x: pos[0], y: pos[1],
        label: "", fontSize: 16, stroke: strokeColor, textAlign: "left",
      };
      onObjectsChange([...objects, newObj]);
      setSelectedObjectId(newId);
      setEditingTextId(newId);
      setEditingTextValue("");
      const screenPos = canvasToScreen(pos[0], pos[1]);
      setEditScreenPos(screenPos);
      return;
    }

    // ── Non-text tools: deselect text ────────────────────
    setSelectedObjectId(null);
    setEditingTextId(null);
    setEditScreenPos(null);

    drawingRef.current = true;
    startPointRef.current = [pos[0], pos[1]];
    if (activeTool === "pen") currentStrokeRef.current = [pos];
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();

    // ── Text tool: drag selected text ────────────────────
    if (activeTool === "text" && isDraggingRef.current && selectedObjectId) {
      const pos = getPos(e);
      const newX = pos[0] - dragOffsetRef.current.dx;
      const newY = pos[1] - dragOffsetRef.current.dy;
      const updated = objects.map((obj) =>
        obj.id === selectedObjectId ? { ...obj, x: newX, y: newY } : obj
      );
      onObjectsChange(updated);
      return;
    }

    if (!drawingRef.current) return;
    const pos = getPos(e);
    if (activeTool === "pen") {
      currentStrokeRef.current.push(pos);
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, width, height); redraw();
      const rc = rough.canvas(canvas); ctx.globalAlpha = 0.6;
      const pts = currentStrokeRef.current;
      const penOpts = { stroke: strokeColor, strokeWidth, roughness: 0.5, seed: 42 };
      for (let i = 1; i < pts.length; i++)
        rc.line(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1], penOpts);
      ctx.globalAlpha = 1;
    } else { drawShapePreview(activeTool, pos); }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    // ── End text drag ────────────────────────────────────
    if (activeTool === "text" && isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }

    if (!drawingRef.current) return;
    drawingRef.current = false;
    const tool = activeTool;
    const newObjects = [...objects];
    const shapeOpts = buildOpts();

    if (tool === "pen" && currentStrokeRef.current.length >= 2) {
      newObjects.push({ type: "line", points: [...currentStrokeRef.current], ...shapeOpts });
    } else if (tool === "line" || tool === "arrow" || tool === "dashed") {
      const [x1, y1] = startPointRef.current;
      const [x2, y2] = getPos(e);
      if (Math.hypot(x2-x1, y2-y1) > 3) {
        newObjects.push({ type: tool, points: [[x1,y1],[x2,y2]], ...shapeOpts });
      }
    } else if (tool === "arc-arrow") {
      const [x1, y1] = startPointRef.current;
      const [x2, y2] = getPos(e);
      if (Math.hypot(x2-x1, y2-y1) > 10) {
        newObjects.push({ type: "arc-arrow", points: [[x1,y1],[x2,y2]], ...shapeOpts });
      }
    } else if (tool === "rect" || tool === "ellipse" || tool === "diamond") {
      const [x1, y1] = startPointRef.current;
      const [x2, y2] = getPos(e);
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      const w = Math.max(Math.abs(x2-x1), 2), h = Math.max(Math.abs(y2-y1), 2);
      if (w>2||h>2) newObjects.push({ type: tool, x, y, w, h, ...shapeOpts });
    } else if (tool === "circle") {
      const [x1, y1] = startPointRef.current;
      const [x2, y2] = getPos(e);
      const r = Math.hypot(x2-x1, y2-y1), size = r*2;
      if (size>4) newObjects.push({ type: "circle", x: x1-r, y: y1-r, w: size, h: size, ...shapeOpts });
    }
    currentStrokeRef.current = [];
    onObjectsChange(newObjects);
    redraw();
  };

  // ── Zoom ──────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => clampZoom(z - e.deltaY * 0.002 * z));
  }, []);
  const zoomIn = () => setZoom((z) => clampZoom(z * 1.25));
  const zoomOut = () => setZoom((z) => clampZoom(z / 1.25));
  const zoomFit = () => {
    const vp = viewportRef.current; if (!vp) return;
    setZoom(Math.round(Math.min((vp.clientWidth-32)/width, (vp.clientHeight-32)/height, 1)*100)/100);
  };
  const handleClear = () => onObjectsChange([]);
  const handleUndo = () => { if (objects.length > 0) onObjectsChange(objects.slice(0, -1)); };

  // ── Text editing commit / cancel ──────────────────────

  useEffect(() => {
    if (editingTextId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTextId]);

  const commitTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const updated = objects.map((obj) =>
      obj.id === editingTextId
        ? { ...obj, label: editingTextValue || "文字" }
        : obj
    );
    onObjectsChange(updated);
    setEditingTextId(null);
    setEditingTextValue("");
    setEditScreenPos(null);
  }, [editingTextId, editingTextValue, objects, onObjectsChange]);

  const cancelTextEdit = useCallback(() => {
    const target = objects.find((o) => o.id === editingTextId);
    // 如果文字对象没有内容且是本次会话新建的，删除它
    if (target && !target.label) {
      onObjectsChange(objects.filter((o) => o.id !== editingTextId));
      setSelectedObjectId(null);
    }
    setEditingTextId(null);
    setEditingTextValue("");
    setEditScreenPos(null);
  }, [editingTextId, objects, onObjectsChange]);

  // ── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Row 1 */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <button
          onClick={onSaveClick}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                     bg-zinc-900 text-white hover:bg-zinc-800 transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          {saving ? <span className="animate-pulse">...</span> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-sm font-medium text-zinc-800 whitespace-nowrap">
            {title || "未命名画布"}
          </h1>
          {canvasId && (
            <span className="text-[10px] text-zinc-300 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-100">
              已保存
            </span>
          )}
        </div>

        <AspectRatioPicker width={width} height={height} onChange={onCanvasSizeChange} />
        <Toolbar
          activeTool={activeTool} onToolChange={handleToolChange}
          onClear={handleClear} onUndo={handleUndo} canUndo={objects.length > 0}
        />

        <div className="flex-1" />
      </div>

      {/* Row 2: stroke/fill properties */}
      <div className="flex items-center gap-4 flex-wrap shrink-0 self-start px-2 py-2 bg-white border border-zinc-200 rounded-xl">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider shrink-0">描边</span>
          <div className="flex gap-0.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setStrokeColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-all cursor-pointer"
                style={{ backgroundColor: c, borderColor: strokeColor===c?"#3b3b3b":"transparent",
                  boxShadow: strokeColor===c?"0 0 0 1px #d4d4d8":"none" }} />
            ))}
          </div>
        </div>
        <div className="w-px h-6 bg-zinc-200" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider shrink-0">粗细</span>
          <div className="flex gap-0.5 items-end">
            {WIDTHS.map((w) => (
              <button key={w} onClick={() => setStrokeWidth(w)}
                className="flex items-center justify-center w-6 h-5 rounded transition-all cursor-pointer"
                style={{ backgroundColor: strokeWidth===w?"#e4e4e7":"transparent" }}>
                <div className="rounded-full"
                  style={{ width: Math.min(w+2,8), height: Math.max(w,1), backgroundColor: strokeColor }} />
              </button>
            ))}
          </div>
        </div>
        <div className="w-px h-6 bg-zinc-200" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider shrink-0">填充</span>
          <div className="flex gap-0.5">
            {FILL_STYLES.map((fs) => (
              <button key={fs.key} onClick={() => setFillStyle(fs.key as FillStyle|"")}
                className={`px-2 py-1 text-[11px] rounded transition-all cursor-pointer
                  ${fillStyle===fs.key?"bg-zinc-900 text-white":"text-zinc-500 hover:bg-zinc-100"}`}>
                {fs.label}</button>
            ))}
          </div>
        </div>
        {fillStyle && <>
          <div className="w-px h-6 bg-zinc-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider shrink-0">填色</span>
            <div className="flex gap-0.5">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setFillColor(c)}
                  className="w-5 h-5 rounded-full border-2 transition-all cursor-pointer"
                  style={{ backgroundColor: c, borderColor: fillColor===c?"#3b3b3b":"transparent",
                    boxShadow: fillColor===c?"0 0 0 1px #d4d4d8":"none" }} />
              ))}
            </div>
          </div>
        </>}
      </div>

      {/* Canvas viewport */}
      <div ref={viewportRef}
        className="flex-1 min-h-0 overflow-auto bg-zinc-100/50 rounded-xl border border-zinc-200 relative"
        onWheel={handleWheel}>
        <div className="flex items-center justify-center min-h-full p-4">
          <canvas ref={canvasRef}
            width={width} height={height}
            style={{ width: width*zoom, height: height*zoom }}
            className={`bg-white shadow-sm border border-zinc-200 touch-none shrink-0 ${activeTool === "text" ? "cursor-default" : "cursor-crosshair"}`}
            onMouseDown={handlePointerDown} onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown} onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp} />
        </div>

        {/* Inline text editing overlay — positioned at text screen location */}
        {editingTextId && editScreenPos && (
          <div
            className="absolute z-20"
            style={{ left: editScreenPos.left, top: editScreenPos.top }}
          >
            <textarea
              ref={editInputRef}
              value={editingTextValue}
              onChange={(e) => setEditingTextValue(e.target.value)}
              placeholder="输入文字…"
              rows={Math.max(2, (editingTextValue.match(/\n/g) || []).length + 1)}
              className="resize-none bg-white/95 border-2 border-blue-400 rounded-lg
                         px-2 py-1 text-sm text-zinc-700 outline-none
                         shadow-lg min-w-[120px] max-w-[360px]
                         placeholder:text-zinc-300"
              style={{ fontSize: 16, fontFamily: "sans-serif" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitTextEdit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTextEdit();
                }
              }}
              onBlur={() => {
                // 延迟执行，让按钮点击事件先触发
                setTimeout(() => {
                  if (editingTextId) commitTextEdit();
                }, 150);
              }}
            />
            <div className="flex items-center gap-1 mt-1">
              <button
                onMouseDown={(e) => { e.preventDefault(); commitTextEdit(); }}
                className="px-2 py-0.5 text-[11px] rounded bg-blue-500 text-white
                           hover:bg-blue-600 transition-colors cursor-pointer"
              >
                确定
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); cancelTextEdit(); }}
                className="px-2 py-0.5 text-[11px] rounded bg-white border border-zinc-200
                           text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                取消
              </button>
              <span className="text-[10px] text-zinc-300 ml-1">
                Enter 确认 · Esc 取消
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Zoom bar */}
      <div className="flex items-center justify-center gap-1 shrink-0">
        <button onClick={zoomOut} disabled={zoom<=0.1}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400
                     hover:bg-zinc-200 hover:text-zinc-600 transition-colors cursor-pointer
                     disabled:opacity-30 disabled:cursor-not-allowed text-sm">−</button>
        <button onClick={zoomFit}
          className="px-2.5 py-1 text-xs rounded-md text-zinc-500
                     hover:bg-zinc-200 hover:text-zinc-700 transition-colors cursor-pointer">
          {Math.round(zoom*100)}%</button>
        <button onClick={zoomIn} disabled={zoom>=5}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400
                     hover:bg-zinc-200 hover:text-zinc-600 transition-colors cursor-pointer
                     disabled:opacity-30 disabled:cursor-not-allowed text-sm">+</button>
      </div>
    </div>
  );
}
